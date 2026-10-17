const os = require('node:os');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

function cpuTimes(cpus) {
    return cpus.reduce((sum, cpu) => ({
        idle: sum.idle + cpu.times.idle,
        total: sum.total + Object.values(cpu.times).reduce((a, b) => a + b, 0),
    }), { idle: 0, total: 0 });
}

function cpuPercent(previous, current) {
    const total = current.total - previous.total;
    const idle = current.idle - previous.idle;
    if (total <= 0 || idle < 0 || idle > total) return null;
    return 100 * (1 - idle / total);
}

function parseNvidiaMetrics(output) {
    const rows = output.trim().split(/\r?\n/);
    if (rows.length !== 1) throw new Error('Expected one NVIDIA GPU sensor row.');
    const [load, used, total, temperature, ...name] = rows[0].split(',').map(value => value.trim());
    if (!name.join(',')) throw new Error('NVIDIA did not report a GPU name.');
    const errors = [];
    const read = (value, label, min, max = Infinity) => {
        const number = value && /^\d+(\.\d+)?$/.test(value) ? Number(value) : NaN;
        if (!Number.isFinite(number) || number < min || number > max) {
            errors.push(`${label} sensor unavailable (${value || 'missing value'}).`);
            return null;
        }
        return number;
    };
    const gpuPercent = read(load, 'GPU', 0, 100);
    const memoryUsed = read(used, 'VRAM used', 0);
    const memoryTotal = read(total, 'VRAM total', 1);
    let vramPercent = null;
    if (memoryUsed !== null && memoryTotal !== null) {
        if (memoryUsed > memoryTotal) errors.push('VRAM usage exceeds reported capacity.');
        else vramPercent = memoryUsed / memoryTotal * 100;
    }
    return {
        gpuPercent,
        vramPercent,
        gpuTemperatureC: read(temperature, 'GPU temperature', 0, 150),
        gpuName: name.join(', '),
        errors,
    };
}

function createSystemMetricsMonitor({ host = os, run = execFileAsync, now = Date.now } = {}) {
    let previous = cpuTimes(host.cpus());
    let pending;
    let cached;
    let completedAt = -Infinity;
    const collect = async () => {
        const current = cpuTimes(host.cpus());
        const cpu = cpuPercent(previous, current);
        previous = current;
        const total = host.totalmem();
        const free = host.freemem();
        const ram = total > 0 && free >= 0 && free <= total ? (total - free) / total * 100 : null;
        const errors = [];
        if (cpu === null) errors.push('CPU sampling interval unavailable; waiting for the next sample.');
        if (ram === null) errors.push('Physical RAM usage unavailable.');
        let gpu = { gpuPercent: null, vramPercent: null, gpuTemperatureC: null, gpuName: null, errors: [] };
        try {
            const { stdout } = await run('nvidia-smi', [
                '--id=0',
                '--query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu,name',
                '--format=csv,noheader,nounits',
            ], { windowsHide: true, timeout: 2000, maxBuffer: 16384 });
            gpu = parseNvidiaMetrics(stdout);
        } catch (error) {
            errors.push(error.code === 'ENOENT'
                ? 'GPU, VRAM and temperature unavailable: NVIDIA nvidia-smi is not installed. These sensors require a supported NVIDIA GPU and driver.'
                : `NVIDIA sensor query failed: ${error.message}`);
        }
        return {
            cpuPercent: cpu,
            ramPercent: ram,
            ...gpu,
            sampledAt: now(),
            errors: [...errors, ...gpu.errors],
        };
    };
    return {
        getSnapshot() {
            if (pending) return pending;
            if (cached && now() - completedAt < 1000) return Promise.resolve(cached);
            pending = collect().then(result => {
                cached = result;
                completedAt = now();
                return result;
            }).finally(() => { pending = undefined; });
            return pending;
        },
    };
}

module.exports = { createSystemMetricsMonitor, cpuTimes, cpuPercent, parseNvidiaMetrics };
