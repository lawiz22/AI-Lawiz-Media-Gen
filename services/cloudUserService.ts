import type { User } from '../types';

// --- Cloud Simulation with Local Persistence ---
// This service now uses localStorage to make user data persistent across browser sessions
// on the same machine. It still simulates network latency to keep the app "cloud-ready".
const STORAGE_KEY = 'cloud_users';

// Simulate network latency
const networkDelay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Retrieves the list of users from localStorage.
 */
export const getUsers = async (): Promise<User[]> => {
  await networkDelay(500); // Simulate fetching data
  const usersJson = localStorage.getItem(STORAGE_KEY);
  if (!usersJson) {
    return [];
  }
  try {
    const users: User[] = JSON.parse(usersJson);
    return users;
  } catch (e) {
    console.error("Failed to parse users from localStorage", e);
    return [];
  }
};

/**
 * Saves the list of users to localStorage.
 */
const saveUsers = async (users: User[]): Promise<void> => {
    await networkDelay(300); // Simulate writing data
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
    } catch (e) {
        console.error("Failed to save users to localStorage", e);
        // Throw an error to ensure the calling function knows the operation failed.
        throw new Error("Could not save user data. Local storage might be full or disabled.");
    }
};

/**
 * Adds a new user to the list, if the username doesn't already exist.
 * @returns A promise that resolves to true on success, or an error message string on failure.
 */
export const addUser = async (newUser: User): Promise<true | string> => {
  const users = await getUsers();
  if (users.some(u => u.username.toLowerCase() === newUser.username.toLowerCase()) || newUser.username.toLowerCase() === 'admin') {
    return 'Username already exists.';
  }
  const userToAdd: User = { ...newUser, role: 'user' };
  const updatedUsers = [...users, userToAdd];
  await saveUsers(updatedUsers);
  return true;
};

/**
 * Deletes a user by their username.
 */
export const deleteUser = async (username: string): Promise<void> => {
  let users = await getUsers();
  users = users.filter(u => u.username !== username);
  await saveUsers(users);
};

/**
 * Authenticates a user based on username and password.
 * Checks against the hardcoded admin and the list from localStorage.
 * @returns A promise resolving to the user object (without password) on success, or null on failure.
 */
export const authenticateUser = async (username: string, password: string): Promise<User | null> => {
  await networkDelay(700); // Simulate authentication request

  // Hardcoded admin user
  if (username.toLowerCase() === 'admin' && password === '1q2w3e4r5t') {
    return { username: 'admin', role: 'admin' };
  }

  const users = await getUsers();
  const foundUser = users.find(u => u.username === username && u.password === password);

  if (foundUser) {
    // Return user object without the password for security in session storage
    return { username: foundUser.username, role: foundUser.role };
  }

  return null;
};