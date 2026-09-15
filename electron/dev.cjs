const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const DEV_SERVER_URL = 'http://127.0.0.1:3000/';

const isDevServerRunning = () => new Promise(resolve => {
    const request = http.get(DEV_SERVER_URL, response => {
        response.resume();
        resolve(response.statusCode >= 200 && response.statusCode < 500);
    });
    request.setTimeout(1000, () => {
        request.destroy();
        resolve(false);
    });
    request.on('error', () => resolve(false));
});

const forwardExit = child => {
    child.on('exit', (code, signal) => {
        if (signal) process.kill(process.pid, signal);
        else process.exitCode = code ?? 1;
    });
};

const waitForDevServer = async child => {
    for (let attempt = 0; attempt < 300; attempt += 1) {
        if (await isDevServerRunning()) return;
        if (child.exitCode !== null) throw new Error(`Vite exited before startup (code ${child.exitCode}).`);
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`Vite did not start at ${DEV_SERVER_URL} within 30 seconds.`);
};

const start = async () => {
    if (await isDevServerRunning()) {
        console.log(`Using existing Vite server at ${DEV_SERVER_URL}`);
        forwardExit(spawn(require('electron'), ['.'], { stdio: 'inherit' }));
        return;
    }

    console.log('Starting Vite and Electron...');
    const viteCli = path.resolve(path.dirname(require.resolve('vite')), '../../bin/vite.js');
    const vite = spawn(process.execPath, [viteCli], {
        stdio: 'inherit',
        env: { ...process.env, BROWSER: 'none' },
    });
    try {
        await waitForDevServer(vite);
        const electron = spawn(require('electron'), ['.'], { stdio: 'inherit' });
        electron.on('exit', (code, signal) => {
            if (!vite.killed) vite.kill();
            if (signal) process.kill(process.pid, signal);
            else process.exitCode = code ?? 1;
        });
    } catch (error) {
        if (!vite.killed) vite.kill();
        throw error;
    }
};

start().catch(error => {
    console.error(error);
    process.exitCode = 1;
});