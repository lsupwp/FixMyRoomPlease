function markAsResolved() {
    const problemId = document.body.dataset.problemId; // Pass from EJS via data attribute
    
    openConfirmationModal({
        title: 'แก้ไขเสร็จแล้ว',
        message: 'คุณต้องการยืนยันว่าแก้ไขปัญหานี้เสร็จแล้วหรือไม่?',
        confirmText: 'ยืนยัน',
        cancelText: 'ยกเลิก',
        confirmColor: 'bg-green-600 hover:bg-green-500',
        onConfirm: () => {
            const form = document.createElement('form');
            form.method = 'POST';
            form.action = '/admin/problem/' + problemId + '/resolve';
            document.body.appendChild(form);
            form.submit();
        }
    });
}
