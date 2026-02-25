const searchUsernameInput = document.getElementById('searchUsername');
const searchStatusSelect = document.getElementById('searchStatus');

function filterProblems() {
    const username = searchUsernameInput.value.toLowerCase();
    const status = searchStatusSelect.value;

    const params = new URLSearchParams();
    if (username) params.append('username', username);
    if (status) params.append('status', status);

    const queryString = params.toString();
    window.location.href = '/admin/problems' + (queryString ? '?' + queryString : '');
}

searchUsernameInput.addEventListener('input', filterProblems);
searchStatusSelect.addEventListener('change', filterProblems);

function markAsResolved(problemId) {
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
