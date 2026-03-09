const messagesList = document.getElementById('messagesList');
const messagesContainer = document.getElementById('messagesContainer');
const chatForm = document.getElementById('chatForm');
const messageInput = document.getElementById('messageInput');
const imageInput = document.getElementById('imageInput');
const attachButton = document.getElementById('attachButton');
const fileCount = document.getElementById('fileCount');
const inboxId = document.getElementById('inboxId').value;
const userRole = document.body.dataset.userRole; // Pass from EJS via data attribute
const connectionStatus = document.getElementById('connectionStatus');

let isLoading = false;
let hasMore = messagesList.children.length >= 20;

const MAX_IMAGES = 3;
const CLICK_THRESHOLD_MS = 500;
const REQUIRED_CLICKS = 3;

function showModalAlert(message) {
    if (typeof openConfirmationModal !== 'function') {
        return;
    }

    openConfirmationModal({
        title: 'แจ้งเตือน',
        message,
        confirmText: 'ตกลง',
        cancelText: 'ปิด',
        confirmColor: 'bg-blue-600 hover:bg-blue-500'
    });
}

function confirmDelete(messageId) {
    if (typeof openConfirmationModal !== 'function') {
        performDelete(messageId);
        return;
    }

    openConfirmationModal({
        title: 'ลบข้อความ',
        message: 'ต้องการลบข้อความนี้หรือไม่?',
        confirmText: 'ลบ',
        cancelText: 'ยกเลิก',
        confirmColor: 'bg-red-600 hover:bg-red-500',
        onConfirm: () => performDelete(messageId)
    });
}

async function performDelete(messageId) {
    try {
        const response = await fetch(`/chat/message/${messageId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ inboxId })
        });

        if (response.ok) {
            markDeleted(messageId);
            return;
        }

        let errorMessage = 'ลบข้อความไม่สำเร็จ กรุณาลองใหม่อีกครั้ง';
        try {
            const data = await response.json();
            if (data && data.error) errorMessage = data.error;
        } catch (error) {
            // Ignore parsing errors and use fallback message
        }
        showModalAlert(errorMessage);
    } catch (error) {
        console.error('Delete message error:', error);
        showModalAlert('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
    }
}

function attachDeleteTrigger(messageEl, messageId, isOwn) {
    if (!isOwn) return;

    let clickCount = 0;
    let clickTimer = null;

    messageEl.addEventListener('click', (event) => {
        if (event.target.closest('button')) return;

        clickCount += 1;

        if (clickTimer) {
            clearTimeout(clickTimer);
        }

        clickTimer = setTimeout(() => {
            clickCount = 0;
        }, CLICK_THRESHOLD_MS);

        if (clickCount >= REQUIRED_CLICKS) {
            clickCount = 0;
            clearTimeout(clickTimer);
            confirmDelete(messageId);
        }
    });
}

// Auto scroll to bottom
function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function updateFileCount() {
    const count = imageInput.files.length;
    fileCount.textContent = count ? `แนบรูป ${count} รูป` : '';
}

attachButton.addEventListener('click', () => imageInput.click());
imageInput.addEventListener('change', () => {
    if (imageInput.files.length > MAX_IMAGES) {
        showModalAlert(`แนบรูปได้ไม่เกิน ${MAX_IMAGES} รูป`);
    }
    updateFileCount();
});

document.querySelectorAll('.message-item[data-is-own="true"]').forEach((messageEl) => {
    attachDeleteTrigger(messageEl, messageEl.dataset.messageId, true);
});

scrollToBottom();

// WebSocket connection
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const ws = new WebSocket(`${protocol}//${window.location.host}`);

ws.onopen = () => {
    connectionStatus.innerHTML = '🟢';
    connectionStatus.className = 'flex h-10 w-10 items-center justify-center rounded-full bg-green-100 text-sm font-semibold text-green-700';
};

ws.onclose = () => {
    connectionStatus.innerHTML = '🔴';
    connectionStatus.className = 'flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-sm font-semibold text-red-700';
};

ws.onerror = () => {
    connectionStatus.innerHTML = '⚠️';
    connectionStatus.className = 'flex h-10 w-10 items-center justify-center rounded-full bg-yellow-100 text-sm font-semibold text-yellow-700';
};

ws.onmessage = (event) => {
    try {
        const data = JSON.parse(event.data);

        if (data.type === 'delete') {
            if (data.inboxId == inboxId || data.inboxId === null) {
                markDeleted(data.messageId);
            }
            return;
        }

        if (data.type === 'unread-update' || data.type === 'inboxes-update') {
            return;
        }

        if (data.inboxId == inboxId && data.sender !== userRole) {
            addMessage(data, false);
        }
    } catch (error) {
        console.error('Error parsing message:', error);
    }
};

function addMessage(msg, prepend) {
    const isOwn = msg.sender === userRole;
    const messageDiv = document.createElement('div');
    messageDiv.className = 'mb-4 message-item';
    messageDiv.dataset.messageId = msg.id;
    messageDiv.dataset.isOwn = String(isOwn);

    const attachmentsHtml = !msg.isDeleted && (msg.attachments || []).map((att) => `
        <a href="${att.url}" target="_blank" rel="noreferrer" class="block overflow-hidden rounded-xl bg-gray-200">
            <img src="${att.url}" alt="รูปแนบ" class="h-24 w-full object-cover" />
        </a>
    `).join('');

    const bubbleContent = msg.isDeleted 
        ? `<p class="text-sm">ข้อความถูกลบแล้ว</p>`
        : `${msg.message ? `<p class="text-sm">${escapeHtml(msg.message)}</p>` : ''}${attachmentsHtml ? `<div class="mt-2 grid grid-cols-2 gap-2">${attachmentsHtml}</div>` : ''}`;

    const bubbleClass = msg.isDeleted 
        ? 'bg-gray-100 text-gray-500'
        : (isOwn ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-900');

    messageDiv.innerHTML = `
        <div class="flex gap-3 max-w-xs ${isOwn ? 'flex-row-reverse ml-auto' : 'flex-row mr-auto'}">
            ${!isOwn ? `
                <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white">
                    ${msg.senderAvatar || '?'}
                </div>
            ` : ''}
            <div class="flex flex-col gap-1 ${isOwn ? 'items-end' : 'items-start'}">
                <div class="flex items-center gap-2">
                    <span class="text-xs font-semibold text-gray-600">${msg.senderName}</span>
                    ${isOwn && !msg.isDeleted ? `<button type="button" class="text-[10px] text-gray-400 transition hover:text-red-500" onclick="deleteMessage(${msg.id})">ลบ</button>` : ''}
                </div>
                <div class="rounded-2xl px-4 py-2 ${bubbleClass}">
                    ${bubbleContent}
                </div>
                <span class="text-xs text-gray-500">${msg.timestamp || ''}</span>
            </div>
        </div>
    `;

    attachDeleteTrigger(messageDiv, msg.id, isOwn);

    if (prepend) {
        messagesList.prepend(messageDiv);
    } else {
        messagesList.appendChild(messageDiv);
        scrollToBottom();
    }
}

function markDeleted(messageId) {
    const messageEl = messagesList.querySelector(`[data-message-id="${messageId}"]`);
    if (!messageEl) return;
    const bubble = messageEl.querySelector('.rounded-2xl');
    const deleteBtn = messageEl.querySelector('button');
    if (bubble) {
        bubble.className = 'rounded-2xl px-4 py-2 bg-gray-100 text-gray-500';
        bubble.innerHTML = '<p class="text-sm">ข้อความถูกลบแล้ว</p>';
    }
    if (deleteBtn) deleteBtn.remove();
    messageEl.dataset.isDeleted = 'true';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

async function loadOlderMessages() {
    const first = messagesList.querySelector('.message-item');
    if (!first) return;
    const beforeId = first.dataset.messageId;

    isLoading = true;
    const prevScrollHeight = messagesContainer.scrollHeight;

    try {
        const response = await fetch(`/chat/messages?inboxId=${encodeURIComponent(inboxId)}&beforeId=${encodeURIComponent(beforeId)}`);
        if (!response.ok) return;

        const data = await response.json();
        hasMore = data.hasMore;

        if (data.messages && data.messages.length > 0) {
            for (let i = data.messages.length - 1; i >= 0; i -= 1) {
                addMessage(data.messages[i], true);
            }
            const newScrollHeight = messagesContainer.scrollHeight;
            messagesContainer.scrollTop = newScrollHeight - prevScrollHeight;
        }
    } catch (error) {
        console.error('Load older messages error:', error);
    } finally {
        isLoading = false;
    }
}

messagesContainer.addEventListener('scroll', () => {
    if (messagesContainer.scrollTop === 0 && hasMore && !isLoading) {
        loadOlderMessages();
    }
});

// Send message
chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const message = messageInput.value.trim();
    if (!message && imageInput.files.length === 0) return;

    if (imageInput.files.length > MAX_IMAGES) {
        showModalAlert(`แนบรูปได้ไม่เกิน ${MAX_IMAGES} รูป`);
        return;
    }

    const formData = new FormData();
    formData.append('message', message);
    formData.append('inboxId', inboxId);
    Array.from(imageInput.files).forEach((file) => formData.append('images', file));

    try {
        const response = await fetch('/chat/send', {
            method: 'POST',
            body: formData
        });

        if (response.ok) {
            const data = await response.json();
            addMessage(data, false);
            messageInput.value = '';
            imageInput.value = '';
            updateFileCount();
        } else {
            let errorMessage = 'ส่งข้อความไม่สำเร็จ กรุณาลองใหม่อีกครั้ง';
            try {
                const data = await response.json();
                if (data && data.error) errorMessage = data.error;
            } catch (error) {
                // Ignore parsing errors and use fallback message
            }
            showModalAlert(errorMessage);
        }
    } catch (error) {
        console.error('Error sending message:', error);
        showModalAlert('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
    }
});

window.deleteMessage = function(messageId) {
    confirmDelete(messageId);
};
