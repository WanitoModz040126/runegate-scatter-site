const form = document.getElementById('signupForm');
const errorBox = document.getElementById('formError');
const submitBtn = document.getElementById('submitBtn');

function showError(msg) {
  errorBox.textContent = msg;
  errorBox.classList.add('show');
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorBox.classList.remove('show');

  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  const password2 = document.getElementById('password2').value;

  if (password !== password2) {
    showError('Passwords do not match.');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Creating account…';

  try {
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      showError(data.error || 'Could not create account.');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Create Account';
      return;
    }
    window.location.href = '/';
  } catch (err) {
    showError('Could not reach the server. Please try again.');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Create Account';
  }
});
