const express = require('express');
const pool = require('../../db');

const router = express.Router();

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

const buildProblemsFromRows = (rows) => {
    const problemMap = new Map();

    rows.forEach((row) => {
        if (!problemMap.has(row.id)) {
            const description = row.problem_description || '';
            const title = description.length > 40 ? `${description.slice(0, 40)}...` : description;
            const status = getStatusFromRow(row);

            problemMap.set(row.id, {
                id: row.id,
                title,
                roomNumber: row.room_number,
                username: row.username,
                description,
                status,
                createdDate: formatDate(row.created_at),
                createdTime: formatTime(row.created_at),
                updatedDate: formatDate(row.updated_at),
                images: []
            });
        }

        if (row.image_url) {
            const problem = problemMap.get(row.id);
            const index = problem.images.length + 1;
            problem.images.push({
                image_url: row.image_url,
                placeholder: `รูป ${index}`,
                gradient: 'from-blue-300 to-blue-500'
            });
        }
    });

    return Array.from(problemMap.values());
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

router.get('/problems', async (req, res) => {
    if (!req.session || req.session.role !== 'admin') {
        return res.redirect('/login');
    }

    const searchUsername = (req.query.username || '').trim();
    const searchStatus = (req.query.status || '').trim();

    try {
        const problems = await withConnection(async (connection) => {
            let query = `
                SELECT
                    p.id,
                    p.problem_description,
                    p.created_at,
                    p.updated_at,
                    p.is_resolved,
                    p.is_deleted,
                    t.room_number,
                    a.username,
                    pi.id AS image_id,
                    pi.image_url
                FROM problems p
                JOIN tenants t ON t.account_id = p.tenant_id
                JOIN accounts a ON a.account_id = p.tenant_id
                LEFT JOIN problem_images pi
                    ON pi.problem_id = p.id
                    AND pi.is_deleted = FALSE
                WHERE p.is_deleted = FALSE
            `;
            
            const params = [];

            // Search username
            if (searchUsername) {
                query += ` AND a.username LIKE ?`;
                params.push(`%${searchUsername}%`);
            }

            // Filter by status
            if (searchStatus) {
                if (searchStatus === 'resolved') {
                    query += ` AND p.is_resolved = TRUE`;
                } else if (searchStatus === 'unresolved') {
                    query += ` AND p.is_resolved = FALSE`;
                }
            }

            query += ` ORDER BY p.created_at DESC, pi.id ASC`;

            const [rows] = await connection.execute(query, params);
            return buildProblemsFromRows(rows);
        });

        const problemsWithBadge = problems.map((problem) => ({
            ...problem,
            badge: getStatusBadge(problem.status)
        }));

        return res.render('admin/view-problen', {
            title: 'จัดการปัญหา',
            problems: problemsWithBadge,
            searchUsername,
            searchStatus
        });
    } catch (error) {
        console.error('Problems fetch error:', error);
        return res.render('admin/view-problen', {
            title: 'จัดการปัญหา',
            problems: [],
            searchUsername,
            searchStatus
        });
    }
});

router.get('/problem/:id', async (req, res) => {
    if (!req.session || req.session.role !== 'admin') {
        return res.redirect('/login');
    }

    const problemId = parseInt(req.params.id);

    try {
        const problem = await withConnection(async (connection) => {
            const query = `
                SELECT
                    p.id,
                    p.problem_description,
                    p.created_at,
                    p.updated_at,
                    p.is_resolved,
                    p.is_deleted,
                    t.room_number,
                    a.username,
                    pi.id AS image_id,
                    pi.image_url
                FROM problems p
                JOIN tenants t ON t.account_id = p.tenant_id
                JOIN accounts a ON a.account_id = p.tenant_id
                LEFT JOIN problem_images pi
                    ON pi.problem_id = p.id
                    AND pi.is_deleted = FALSE
                WHERE p.id = ?
                ORDER BY pi.id ASC
            `;

            const [rows] = await connection.execute(query, [problemId]);

            if (rows.length === 0) {
                return null;
            }

            const description = rows[0].problem_description || '';
            const title = description.length > 40 ? `${description.slice(0, 40)}...` : description;
            const status = getStatusFromRow(rows[0]);

            const problemData = {
                id: rows[0].id,
                title,
                roomNumber: rows[0].room_number,
                username: rows[0].username,
                description,
                status,
                createdDate: formatDate(rows[0].created_at),
                createdTime: formatTime(rows[0].created_at),
                updatedDate: formatDate(rows[0].updated_at),
                badge: getStatusBadge(status),
                images: []
            };

            rows.forEach((row) => {
                if (row.image_url) {
                    const index = problemData.images.length + 1;
                    problemData.images.push({
                        image_url: row.image_url,
                        placeholder: `รูป ${index}`,
                        gradient: 'from-blue-300 to-blue-500'
                    });
                }
            });

            return problemData;
        });

        if (!problem) {
            return res.status(404).render('404', { role: req.session.role });
        }

        return res.render('admin/report-detials', {
            title: `รายงาน #${String(problem.id).padStart(3, '0')}`,
            problem
        });
    } catch (error) {
        console.error('Problem detail fetch error:', error);
        return res.status(404).render('404', { role: req.session.role });
    }
});

router.post('/problem/:id/resolve', async (req, res) => {
    if (!req.session || req.session.role !== 'admin') {
        return res.redirect('/login');
    }

    const problemId = parseInt(req.params.id);

    try {
        await withConnection(async (connection) => {
            await connection.execute(
                `
                    UPDATE problems
                    SET is_resolved = TRUE
                    WHERE id = ?
                `,
                [problemId]
            );
        });

        return res.redirect('/admin/problems');
    } catch (error) {
        console.error('Resolve problem error:', error);
        return res.redirect('/admin/problems');
    }
});

module.exports = router;
