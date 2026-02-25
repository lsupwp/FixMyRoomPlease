const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const pool = require('../../db');

const router = express.Router();

const uploadDir = path.join(__dirname, '../../public/uploads/reports');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const username = req.session?.username || 'unknown';
        const timestamp = Date.now();
        const ext = path.extname(file.originalname);
        if (!req.fileIndex) req.fileIndex = 0;
        const index = req.fileIndex++;
        cb(null, `${username}_${index}_${timestamp}${ext}`);
    }
});

const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
            return cb(new Error('Only image files are allowed'));
        }
        cb(null, true);
    }
});

const getStatusBadge = (status) => {
    const badges = {
        unresolved: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'รอการแก้ไข' },
        in_progress: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'กำลังแก้ไข' },
        resolved: { bg: 'bg-green-100', text: 'text-green-700', label: 'แก้ไขแล้ว' },
        cancelled: { bg: 'bg-gray-100', text: 'text-gray-700', label: 'ยกเลิกแล้ว' }
    };
    return badges[status] || badges.unresolved;
};

const formatDate = (value) => {
    if (!value) return null;
    return new Date(value).toLocaleDateString('th-TH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
};

const formatTime = (value) => {
    if (!value) return null;
    return new Date(value).toLocaleTimeString('th-TH', {
        hour: '2-digit',
        minute: '2-digit'
    });
};

const getStatusFromRow = (row) => {
    if (row.is_deleted) return 'cancelled';
    if (row.is_resolved) return 'resolved';
    return 'unresolved';
};

const buildReportsFromRows = (rows) => {
    const reportMap = new Map();

    rows.forEach((row) => {
        if (!reportMap.has(row.id)) {
            const description = row.problem_description || '';
            const title = description.length > 40 ? `${description.slice(0, 40)}...` : description;
            const status = getStatusFromRow(row);

            reportMap.set(row.id, {
                id: row.id,
                title,
                roomNumber: row.room_number,
                description,
                status,
                createdDate: formatDate(row.created_at),
                createdTime: formatTime(row.created_at),
                updatedDate: formatDate(row.updated_at),
                images: []
            });
        }

        if (row.image_url) {
            const report = reportMap.get(row.id);
            const index = report.images.length + 1;
            report.images.push({
                image_id: row.image_id,
                image_url: row.image_url,
                placeholder: `รูป ${index}`,
                gradient: 'from-blue-300 to-blue-500'
            });
        }
    });

    return Array.from(reportMap.values());
};

const withConnection = async (handler) => {
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();
        const result = await handler(connection);
        await connection.commit();
        return result;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};

router.get('/view-report', async (req, res) => {
    if (!req.session || req.session.role !== 'tenant') {
        return res.redirect('/login');
    }

    try {
        const reports = await withConnection(async (connection) => {
            const [rows] = await connection.execute(
                `
                    SELECT
                        p.id,
                        p.problem_description,
                        p.created_at,
                        p.updated_at,
                        p.is_resolved,
                        p.is_deleted,
                        t.room_number,
                        pi.id AS image_id,
                        pi.image_url
                    FROM problems p
                    JOIN tenants t ON t.account_id = p.tenant_id
                    LEFT JOIN problem_images pi
                        ON pi.problem_id = p.id
                        AND pi.is_deleted = FALSE
                    WHERE p.tenant_id = ?
                    ORDER BY p.created_at DESC, pi.id ASC
                `,
                [req.session.account_id]
            );

            return buildReportsFromRows(rows);
        });

        const reportsWithBadge = reports.map((report, index) => ({
            ...report,
            index: reports.length - index,
            badge: getStatusBadge(report.status)
        }));

        return res.render('tenant/view-report', {
            title: 'รายงานของฉัน',
            reports: reportsWithBadge
        });
    } catch (error) {
        return res.render('tenant/view-report', {
            title: 'รายงานของฉัน',
            reports: []
        });
    }
});

router.post('/tenant/report', upload.array('images', 6), async (req, res) => {
    if (!req.session || req.session.role !== 'tenant') {
        return res.redirect('/login');
    }

    const problem = (req.body.problem || '').trim();

    if (!problem) {
        return res.render('tenant/home', { 
            title: 'รายงานปัญหา', 
            error: 'กรุณากรอกรายละเอียดปัญหา' 
        });
    }

    try {
        await withConnection(async (connection) => {
            const [result] = await connection.execute(
                `
                    INSERT INTO problems (tenant_id, problem_description)
                    VALUES (?, ?)
                `,
                [req.session.account_id, problem]
            );

            const problemId = result.insertId;
            const images = (req.files || []).map((file) => [
                problemId,
                `/uploads/reports/${file.filename}`
            ]);

            if (images.length > 0) {
                await connection.query(
                    'INSERT INTO problem_images (problem_id, image_url) VALUES ?'
                    , [images]
                );
            }
        });

        return res.redirect('/view-report');
    } catch (error) {
        console.error('Report submission error:', error);
        return res.render('tenant/home', { 
            title: 'รายงานปัญหา', 
            error: 'เกิดข้อผิดพลาดในการส่งรายงาน กรุณาลองใหม่อีกครั้ง' 
        });
    }
});

router.get('/report/:id', async (req, res) => {
    if (!req.session || req.session.role !== 'tenant') {
        return res.redirect('/login');
    }

    const reportId = parseInt(req.params.id);

    try {
        const reports = await withConnection(async (connection) => {
            const [rows] = await connection.execute(
                `
                    SELECT
                        p.id,
                        p.problem_description,
                        p.created_at,
                        p.updated_at,
                        p.is_resolved,
                        p.is_deleted,
                        t.room_number,
                        pi.id AS image_id,
                        pi.image_url
                    FROM problems p
                    JOIN tenants t ON t.account_id = p.tenant_id
                    LEFT JOIN problem_images pi
                        ON pi.problem_id = p.id
                        AND pi.is_deleted = FALSE
                    WHERE p.id = ? AND p.tenant_id = ?
                    ORDER BY pi.id ASC
                `,
                [reportId, req.session.account_id]
            );

            return buildReportsFromRows(rows);
        });

        if (!reports.length) {
            return res.redirect('/view-report');
        }

        // Get total count of reports to determine index
        const [countRows] = await withConnection(async (connection) => {
            return await connection.execute(
                `
                    SELECT COUNT(*) as total,
                    (SELECT COUNT(*) FROM problems WHERE tenant_id = ? AND created_at >= (
                        SELECT created_at FROM problems WHERE id = ?
                    )) as report_index
                    FROM problems
                    WHERE tenant_id = ?
                `,
                [req.session.account_id, reportId, req.session.account_id]
            );
        });

        const reportWithBadge = {
            ...reports[0],
            index: countRows[0].report_index,
            badge: getStatusBadge(reports[0].status)
        };

        return res.render('tenant/report-detail', {
            title: `รายงาน #${String(reportWithBadge.index).padStart(3, '0')}`,
            report: reportWithBadge
        });
    } catch (error) {
        return res.redirect('/view-report');
    }
});

router.get('/report/:id/edit', async (req, res) => {
    if (!req.session || req.session.role !== 'tenant') {
        return res.redirect('/login');
    }

    const reportId = parseInt(req.params.id);

    try {
        const reports = await withConnection(async (connection) => {
            const [rows] = await connection.execute(
                `
                    SELECT
                        p.id,
                        p.problem_description,
                        p.created_at,
                        p.updated_at,
                        p.is_resolved,
                        p.is_deleted,
                        t.room_number,
                        pi.id AS image_id,
                        pi.image_url
                    FROM problems p
                    JOIN tenants t ON t.account_id = p.tenant_id
                    LEFT JOIN problem_images pi
                        ON pi.problem_id = p.id
                        AND pi.is_deleted = FALSE
                    WHERE p.id = ? AND p.tenant_id = ?
                    ORDER BY pi.id ASC
                `,
                [reportId, req.session.account_id]
            );

            return buildReportsFromRows(rows);
        });

        if (!reports.length) {
            return res.redirect('/view-report');
        }

        // Get total count of reports to determine index
        const [countRows] = await withConnection(async (connection) => {
            return await connection.execute(
                `
                    SELECT COUNT(*) as total,
                    (SELECT COUNT(*) FROM problems WHERE tenant_id = ? AND created_at >= (
                        SELECT created_at FROM problems WHERE id = ?
                    )) as report_index
                    FROM problems
                    WHERE tenant_id = ?
                `,
                [req.session.account_id, reportId, req.session.account_id]
            );
        });

        const reportWithBadge = {
            ...reports[0],
            index: countRows[0].report_index,
            badge: getStatusBadge(reports[0].status)
        };

        return res.render('tenant/report-edit', {
            title: `แก้ไขรายงาน #${String(reportWithBadge.index).padStart(3, '0')}`,
            report: reportWithBadge,
            error: req.query.error || null
        });
    } catch (error) {
        return res.redirect('/view-report');
    }
});

router.post('/report/:id/update', upload.array('images', 6), async (req, res) => {
    if (!req.session || req.session.role !== 'tenant') {
        return res.redirect('/login');
    }

    const reportId = parseInt(req.params.id);
    const description = (req.body.description || '').trim();
    const deletedImages = (req.body.deletedImages || '').split(',').filter(id => id).map(id => parseInt(id));

    if (!description) {
        return res.redirect(`/report/${reportId}/edit?error=${encodeURIComponent('กรุณากรอกรายละเอียดปัญหา')}`);
    }

    try {
        await withConnection(async (connection) => {
            // Update problem description
            await connection.execute(
                `
                    UPDATE problems
                    SET problem_description = ?
                    WHERE id = ? AND tenant_id = ? AND is_deleted = FALSE
                `,
                [description, reportId, req.session.account_id]
            );

            // Delete selected images
            if (deletedImages.length > 0) {
                const placeholders = deletedImages.map(() => '?').join(',');
                await connection.execute(
                    `
                        UPDATE problem_images
                        SET is_deleted = TRUE
                        WHERE id IN (${placeholders}) AND problem_id = ?
                    `,
                    [...deletedImages, reportId]
                );
            }

            // Add new images
            const newImages = (req.files || []).map((file) => [
                reportId,
                `/uploads/reports/${file.filename}`
            ]);

            if (newImages.length > 0) {
                await connection.query(
                    'INSERT INTO problem_images (problem_id, image_url) VALUES ?',
                    [newImages]
                );
            }
        });

        return res.redirect(`/report/${reportId}`);
    } catch (error) {
        console.error('Update error:', error);
        return res.redirect(`/report/${reportId}/edit?error=${encodeURIComponent('เกิดข้อผิดพลาดในการบันทึก กรุณาลองใหม่อีกครั้ง')}`);
    }
});

router.post('/report/:id/cancel', async (req, res) => {
    if (!req.session || req.session.role !== 'tenant') {
        return res.redirect('/login');
    }

    const reportId = parseInt(req.params.id);

    try {
        await withConnection(async (connection) => {
            await connection.execute(
                `
                    UPDATE problems
                    SET is_deleted = TRUE, deleted_at = NOW()
                    WHERE id = ? AND tenant_id = ? AND is_deleted = FALSE
                `,
                [reportId, req.session.account_id]
            );
        });

        return res.redirect(`/report/${reportId}`);
    } catch (error) {
        return res.redirect('/view-report');
    }
});

module.exports = router;