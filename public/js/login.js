const form = document.getElementById('loginForm');
const errorBox = document.getElementById('formError');
const submitBtn = document.getElementById('submitBtn');

function showError(msg) {
  errorBox.textContent = msg;
  errorBox.classList.add('show');
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorBox.classList.remove('show');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Logging in…';

  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      showError(data.error || 'Login failed.');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Log In';
      return;
    }
    // csrfToken is also mirrored into a readable cookie by the server;
    // game.js reads it from there for subsequent state-changing requests.
    window.location.href = '/';
  } catch (err) {
    showError('Could not reach the server. Please try again.');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Log In';
  }
});
