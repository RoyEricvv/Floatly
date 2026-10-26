// Genera un video real sin archivos externos: un canvas animado como MediaStream.
window.makeSyntheticVideo = function (video, { color = '#2f6fed', fps = 30 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 360;
  const ctx = canvas.getContext('2d');
  let frame = 0;
  setInterval(() => {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 640, 360);
    ctx.fillStyle = '#fff';
    ctx.font = '48px sans-serif';
    ctx.fillText(`frame ${frame++}`, 40, 200);
  }, 1000 / fps);
  video.srcObject = canvas.captureStream(fps);
  return video.play();
};
