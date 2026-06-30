(() => {
  if (!window.penguin) return;
  const peek = document.getElementById('peek');

  function applyDockState(state) {
    document.body.classList.toggle('docked-left', state?.side === 'left');
    document.body.classList.toggle('docked-right', state?.side !== 'left');
  }

  const reveal = () => window.penguin.peekReveal();
  peek.addEventListener('mouseenter', reveal, { once: false });
  peek.addEventListener('click', reveal);
  peek.addEventListener('focus', reveal);
  window.penguin.onDockState(applyDockState);
  window.penguin.getDockState().then(applyDockState);
})();
