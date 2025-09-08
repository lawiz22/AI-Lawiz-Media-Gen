import type { User } from '../types';

const USERS_STORAGE_KEY = 'portrait-gen-users';

// NOTE: Storing passwords in localStorage in plaintext is insecure and should
// never be done in a production application. This is for demonstration purposes only.

/**
 * Retrieves the list of users from localStorage.
 */
export const getUsers = (): User[] => {
  try {
    const usersJson = localStorage.getItem(USERS_STORAGE_KEY);
    return usersJson ? JSON.parse(usersJson) : [];
  } catch (e) {
    console.error('Failed to parse users from localStorage', e);
    return [];
  }
};

/**
 * Saves the list of users to localStorage.
 */
const saveUsers = (users: User[]): void => {
  localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
};

/**
 * Adds a new user to the list, if the username doesn't already exist.
 * @returns true on success, or an error message string on failure.
 */
export const addUser = (newUser: User): true | string => {
  const users = getUsers();
  if (users.some(u => u.username.toLowerCase() === newUser.username.toLowerCase()) || newUser.username.toLowerCase() === 'admin') {
    return 'Username already exists.';
  }
  users.push({ ...newUser, role: 'user' }); // Ensure all created users have 'user' role
  saveUsers(users);
  return true;
};

/**
 * Deletes a user by their username.
 */
export const deleteUser = (username: string): void => {
  let users = getUsers();
  users = users.filter(u => u.username !== username);
  saveUsers(users);
};

/**
 * Authenticates a user based on username and password.
 * Checks against the hardcoded admin and the list from localStorage.
 * @returns The user object (without password) on success, or null on failure.
 */
export const authenticateUser = (username: string, password: string): User | null => {
  // Hardcoded admin user
  if (username.toLowerCase() === 'admin' && password === '1q2w3e4r5t') {
    return { username: 'admin', role: 'admin' };
  }

  const users = getUsers();
  const foundUser = users.find(u => u.username === username && u.password === password);

  if (foundUser) {
    // Return user object without the password for security in session storage
    return { username: foundUser.username, role: foundUser.role };
  }

  return null;
};
