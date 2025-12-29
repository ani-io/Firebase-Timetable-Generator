// Authentication and Role-Based Routing

// Login function
async function login(email, password) {
    try {
        showLoading(true);
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        const user = userCredential.user;

        // Fetch user role from database
        const userSnapshot = await database.ref(`users/${user.uid}`).once('value');
        const userData = userSnapshot.val();

        if (!userData) {
            throw new Error('User profile not found. Please contact administrator.');
        }

        // Redirect based on role
        redirectByRole(userData.role);

    } catch (error) {
        showLoading(false);
        showError(getErrorMessage(error));
    }
}

// Redirect user based on their role
function redirectByRole(role) {
    switch (role) {
        case 'admin':
            window.location.href = 'admin.html';
            break;
        case 'faculty':
            window.location.href = 'faculty.html';
            break;
        case 'student':
            window.location.href = 'student.html';
            break;
        default:
            showError('Invalid user role. Please contact administrator.');
    }
}

// Logout function
function logout() {
    auth.signOut().then(() => {
        window.location.href = 'index.html';
    }).catch((error) => {
        console.error('Logout error:', error);
    });
}

// Check authentication state on page load
function checkAuthState(requiredRole = null) {
    return new Promise((resolve, reject) => {
        auth.onAuthStateChanged(async (user) => {
            if (user) {
                try {
                    const userSnapshot = await database.ref(`users/${user.uid}`).once('value');
                    const userData = userSnapshot.val();

                    if (!userData) {
                        reject('User profile not found');
                        return;
                    }

                    // If a specific role is required, validate it
                    if (requiredRole && userData.role !== requiredRole) {
                        // Redirect to correct dashboard
                        redirectByRole(userData.role);
                        reject('Access denied');
                        return;
                    }

                    resolve({ user, userData });
                } catch (error) {
                    reject(error.message);
                }
            } else {
                // Not logged in, redirect to login page
                if (window.location.pathname !== '/index.html' &&
                    !window.location.pathname.endsWith('/')) {
                    window.location.href = 'index.html';
                }
                reject('Not authenticated');
            }
        });
    });
}

// Get current user data
async function getCurrentUserData() {
    const user = auth.currentUser;
    if (!user) return null;

    const snapshot = await database.ref(`users/${user.uid}`).once('value');
    return snapshot.val();
}

// Helper: Show loading state
function showLoading(show) {
    const loadingEl = document.getElementById('loading');
    const loginBtn = document.getElementById('loginBtn');

    if (loadingEl) {
        loadingEl.style.display = show ? 'block' : 'none';
    }
    if (loginBtn) {
        loginBtn.disabled = show;
        loginBtn.textContent = show ? 'Signing in...' : 'Sign In';
    }
}

// Helper: Show error message
function showError(message) {
    const errorEl = document.getElementById('errorMessage');
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.style.display = 'block';
    }
}

// Helper: Get user-friendly error message
function getErrorMessage(error) {
    switch (error.code) {
        case 'auth/user-not-found':
            return 'No account found with this email.';
        case 'auth/wrong-password':
            return 'Incorrect password.';
        case 'auth/invalid-email':
            return 'Invalid email address.';
        case 'auth/user-disabled':
            return 'This account has been disabled.';
        case 'auth/too-many-requests':
            return 'Too many failed attempts. Please try again later.';
        default:
            return error.message || 'An error occurred. Please try again.';
    }
}

// Initialize login form handler
function initLoginForm() {
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            login(email, password);
        });
    }

    // Check if already logged in
    auth.onAuthStateChanged(async (user) => {
        if (user && window.location.pathname.includes('index.html')) {
            const snapshot = await database.ref(`users/${user.uid}`).once('value');
            const userData = snapshot.val();
            if (userData) {
                redirectByRole(userData.role);
            }
        }
    });
}

// Auto-initialize on login page
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('loginForm')) {
        initLoginForm();
    }
});
