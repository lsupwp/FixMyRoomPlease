(function () {
    const input = document.getElementById('images');
    const dropzone = document.getElementById('dropzone');
    const pickButton = document.getElementById('pickImages');
    const previewGrid = document.getElementById('previewGrid');

    if (!input || !dropzone || !pickButton || !previewGrid) return;

    const filesState = [];

    const syncInputFiles = () => {
        const dataTransfer = new DataTransfer();
        filesState.forEach((file) => dataTransfer.items.add(file));
        input.files = dataTransfer.files;
    };

    const renderPreviews = () => {
        previewGrid.innerHTML = '';
        filesState.forEach((file, index) => {
            const url = URL.createObjectURL(file);

            const wrapper = document.createElement('div');
            wrapper.className = 'relative overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm';

            const img = document.createElement('img');
            img.src = url;
            img.alt = file.name;
            img.className = 'h-40 w-full object-cover sm:h-48';

            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-sm font-semibold text-gray-700 shadow transition hover:bg-white';
            removeBtn.innerHTML = '&#10005;';
            removeBtn.addEventListener('click', () => {
                filesState.splice(index, 1);
                syncInputFiles();
                renderPreviews();
                URL.revokeObjectURL(url);
            });

            const caption = document.createElement('div');
            caption.className = 'truncate px-3 py-2 text-xs text-gray-600';
            caption.textContent = file.name;

            wrapper.appendChild(img);
            wrapper.appendChild(removeBtn);
            wrapper.appendChild(caption);
            previewGrid.appendChild(wrapper);
        });
    };

    const addFiles = (fileList) => {
        Array.from(fileList).forEach((file) => {
            if (!file.type.startsWith('image/')) return;
            filesState.push(file);
        });
        syncInputFiles();
        renderPreviews();
    };

    pickButton.addEventListener('click', () => input.click());
    input.addEventListener('change', (event) => addFiles(event.target.files));

    ['dragenter', 'dragover'].forEach((eventName) => {
        dropzone.addEventListener(eventName, (event) => {
            event.preventDefault();
            dropzone.classList.add('border-blue-400', 'bg-blue-50');
        });
    });

    ['dragleave', 'drop'].forEach((eventName) => {
        dropzone.addEventListener(eventName, (event) => {
            event.preventDefault();
            dropzone.classList.remove('border-blue-400', 'bg-blue-50');
        });
    });

    dropzone.addEventListener('drop', (event) => {
        addFiles(event.dataTransfer.files);
    });
})();
