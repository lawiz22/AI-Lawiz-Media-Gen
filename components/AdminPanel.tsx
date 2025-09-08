import React, { useState, useEffect } from 'react';
import { getUsers, addUser, deleteUser } from '../services/userService';
import type { User } from '../types';
import { TrashIcon, UserGroupIcon } from './icons';

export const AdminPanel: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setUsers(getUsers());
  }, []);

  const handleAddUser = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!newUsername.trim() || !newPassword.trim()) {
      setError("Username and password cannot be empty.");
      return;
    }

    const result = addUser({
      username: newUsername,
      password: newPassword,
      role: 'user',
    });

    if (result === true) {
      setSuccess(`User "${newUsername}" created successfully!`);
      setUsers(getUsers()); // Refresh user list
      setNewUsername('');
      setNewPassword('');
    } else {
      setError(result);
    }
  };

  const handleDeleteUser = (username: string) => {
    if (window.confirm(`Are you sure you want to delete the user "${username}"?`)) {
      deleteUser(username);
      setUsers(getUsers()); // Refresh user list
      setSuccess(`User "${username}" deleted.`);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      {/* Create User Form */}
      <div className="bg-bg-secondary p-6 rounded-2xl shadow-lg">
        <h3 className="text-xl font-bold text-accent mb-4">Create New User</h3>
        <form onSubmit={handleAddUser} className="space-y-4">
          <div>
            <label htmlFor="new-username" className="block text-sm font-medium text-text-secondary">Username</label>
            <input
              id="new-username"
              type="text"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              className="mt-1 block w-full bg-bg-tertiary border border-border-primary rounded-md p-2 text-sm focus:ring-accent focus:border-accent"
              required
            />
          </div>
          <div>
            <label htmlFor="new-password"className="block text-sm font-medium text-text-secondary">Password</label>
            <input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="mt-1 block w-full bg-bg-tertiary border border-border-primary rounded-md p-2 text-sm focus:ring-accent focus:border-accent"
              required
            />
          </div>
          {error && <p className="text-sm text-danger bg-danger-bg p-2 rounded-md">{error}</p>}
          {success && <p className="text-sm text-green-400 bg-green-900/50 p-2 rounded-md">{success}</p>}
          <button
            type="submit"
            className="w-full flex items-center justify-center gap-2 bg-accent text-accent-text font-bold py-2 px-4 rounded-lg hover:bg-accent-hover transition-colors duration-200"
          >
            Create User
          </button>
        </form>
      </div>

      {/* User List */}
      <div className="bg-bg-secondary p-6 rounded-2xl shadow-lg">
        <h3 className="text-xl font-bold text-accent mb-4 flex items-center gap-2">
          <UserGroupIcon className="w-6 h-6" />
          Existing Users
        </h3>
        <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
          {users.length > 0 ? (
            users.map((user) => (
              <div
                key={user.username}
                className="flex items-center justify-between bg-bg-tertiary p-3 rounded-md"
              >
                <span className="text-text-primary font-medium">{user.username}</span>
                <button
                  onClick={() => handleDeleteUser(user.username)}
                  className="text-text-secondary hover:text-danger transition-colors"
                  title={`Delete ${user.username}`}
                >
                  <TrashIcon className="w-5 h-5" />
                </button>
              </div>
            ))
          ) : (
            <p className="text-text-secondary text-sm text-center py-4">No users have been created yet.</p>
          )}
        </div>
      </div>
    </div>
  );
};
