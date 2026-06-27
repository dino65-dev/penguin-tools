const image = document.getElementById('screenImage');
const shade = document.getElementById('shade');
const selection = document.getElementById('selection');
const dimensions = document.getElementById('dimensions');
const hint = document.getElementById('hint');

let start = null;
let rect = null;
let dragging = false;

function normalized(a, b) {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  };
}

function draw(next) {
  rect = next;
  selection.style.left = `${next.x}px`;
  selection.style.top = `${next.y}px`;
  selection.style.width = `${next.width}px`;
  selection.style.height = `${next.height}px`;
  dimensions.textContent = `${Math.round(next.width)} × ${Math.round(next.height)}`;
  selection.classList.toggle('near-top', next.y < 40);
  selection.classList.toggle('near-bottom', window.innerHeight - (next.y + next.height) < 55);
}

function cancel() {
  window.penguin.cancelCapture();
}

function finish() {
  if (!rect || rect.width < 3 || rect.height < 3) return;
  window.penguin.finishCapture(rect);
}

document.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || event.target.closest('button')) return;
  start = { x: event.clientX, y: event.clientY };
  dragging = true;
  hint.style.display = 'none';
  shade.style.display = 'none';
  selection.classList.add('active');
  draw({ x: start.x, y: start.y, width: 0, height: 0 });
  document.body.setPointerCapture?.(event.pointerId);
});

document.addEventListener('pointermove', (event) => {
  if (!dragging || !start) return;
  draw(normalized(start, { x: event.clientX, y: event.clientY }));
});

document.addEventListener('pointerup', (event) => {
  if (!dragging) return;
  dragging = false;
  if (rect.width < 3 || rect.height < 3) {
    selection.classList.remove('active');
    shade.style.display = 'block';
    hint.style.display = 'flex';
    rect = null;
  }
  document.body.releasePointerCapture?.(event.pointerId);
});

document.getElementById('copyButton').addEventListener('click', finish);
document.getElementById('cancelButton').addEventListener('click', cancel);
document.getElementById('hintCancel').addEventListener('click', cancel);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') cancel();
  if (event.key === 'Enter') finish();
});

window.penguin.onCaptureImage(({ dataUrl }) => { image.src = dataUrl; });

