const iconSizes = [16, 32, 48, 128];
const downloadButton = document.getElementById('download-icons');
const sourceIcon = new Image();

sourceIcon.onload = () => {
  for (const size of iconSizes) {
    const canvas = document.getElementById(`icon${size}`);
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, size, size);
    context.drawImage(sourceIcon, 0, 0, size, size);
  }
  downloadButton.disabled = false;
};

sourceIcon.onerror = () => {
  downloadButton.textContent = '图标源文件加载失败，请重新打开导出页';
};

downloadButton.addEventListener('click', () => {
  for (const size of iconSizes) {
    const canvas = document.getElementById(`icon${size}`);
    const link = document.createElement('a');
    link.download = `icon${size}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }
});

sourceIcon.src = 'icon.svg';
