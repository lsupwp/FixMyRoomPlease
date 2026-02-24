const fileInput = document.getElementById('fileInput');
const uploadArea = document.getElementById('uploadArea');
const allImagesGrid = document.getElementById('allImagesGrid');

// Prevent default drag behaviors
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    uploadArea.addEventListener(eventName, preventDefaults, false);
    document.body.addEventListener(eventName, preventDefaults, false);
});

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

// Highlight drop area when item is dragged over it
['dragenter', 'dragover'].forEach(eventName => {
    uploadArea.addEventListener(eventName, () => {
        uploadArea.classList.add('border-blue-400', 'bg-blue-50');
    });
});

['dragleave', 'drop'].forEach(eventName => {
    uploadArea.addEventListener(eventName, () => {
        uploadArea.classList.remove('border-blue-400', 'bg-blue-50');
    });
});

// Handle dropped files
uploadArea.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    handleFiles(files);
});

// Handle file input
fileInput.addEventListener('change', (e) => {
    handleFiles(e.target.files);
});

function handleFiles(files) {
    const filesArray = Array.from(files);

    filesArray.forEach((file, index) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const div = document.createElement('div');
            div.className = 'relative overflow-hidden rounded-xl bg-gray-200';
            div.innerHTML = `
                <img src="${e.target.result}" class="h-32 w-full object-cover" />
                <button 
                    type="button" 
                    onclick="removePreview(this)"
                    class="absolute top-2 right-2 rounded-full bg-red-500 p-1.5 shadow-lg transition hover:bg-red-600"
                >
                    <svg class="h-4 w-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                    </svg>
                </button>
            `;
            allImagesGrid.appendChild(div);
        };
        reader.readAsDataURL(file);
    });
}

function removePreview(btn) {
    btn.parentElement.remove();
}

function removeImage(btn, imageId) {
    // Add image ID to deleted list
    const deletedInput = document.getElementById('deletedImages');
    const deletedIds = deletedInput.value ? deletedInput.value.split(',') : [];
    deletedIds.push(imageId);
    deletedInput.value = deletedIds.join(',');
    
    // Remove from DOM
    btn.parentElement.remove();
}

function confirmSaveChanges() {
    openConfirmationModal({
        title: 'บันทึกการเปลี่ยนแปลง',
        message: 'คุณต้องการบันทึกการเปลี่ยนแปลงที่คุณทำหรือไม่?',
        confirmText: 'บันทึก',
        cancelText: 'ยกเลิก',
        confirmColor: 'bg-blue-600 hover:bg-blue-500',
        onConfirm: () => {
            document.getElementById('editForm').submit();
        }
    });
}
