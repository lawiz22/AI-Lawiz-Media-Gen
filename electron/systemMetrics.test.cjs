const test = require('node:test');
const assert = require('node:assert/strict');
const { cpuTimes, cpuPercent, parseNvidiaMetrics, createSystemMetricsMonitor } = require('./systemMetrics.cjs');

test('CPU usage combines all cores and measures the interval, not cumulative uptime', () => {
    assert.deepEqual(cpuTimes([
        { times: { idle: 80, user: 10, sys: 10 } },
        { times: { idle: 20, user: 30, sys: 50 } },
    ]), { idle: 100, total: 200 });
    assert.equal(cpuPercent({ idle: 100, total: 200 }, { idle: 150, total: 400 }), 75);
    assert.equal(cpuPercent({ idle: 0, total: 0 }, { idle: 100, total: 100 }), 0);
    assert.equal(cpuPercent({ idle: 0, total: 0 }, { idle: 0, total: 100 }), 100);
    assert.equal(cpuPercent({ idle: 0, total: 0 }, { idle: 0, total: 0 }), null);
    assert.equal(cpuPercent({ idle: 100, total: 200 }, { idle: 0, total: 400 }), null);
});

test('NVIDIA GPU, dedicated memory and temperature are real independent sensors', () => {
    assert.deepEqual(parseNvidiaMetrics('45, 6553.6, 8192, 51, NVIDIA GeForce RTX 3070\n'), {
        gpuPercent: 45, vramPercent: 80, gpuTemperatureC: 51,
        gpuName: 'NVIDIA GeForce RTX 3070', errors: [],
    });
    const partial = parseNvidiaMetrics('[N/A], 0, 8192, [Not Supported], NVIDIA GPU');
    assert.equal(partial.gpuPercent, null);
    assert.equal(partial.vramPercent, 0);
    assert.equal(partial.gpuTemperatureC, null);
    assert.equal(partial.errors.length, 2);
    assert.equal(parseNvidiaMetrics('101, 8193, 8192, 151, NVIDIA GPU').vramPercent, null);
    assert.equal(parseNvidiaMetrics('0, 0, 0, 0, NVIDIA GPU').vramPercent, null);
    assert.throws(() => parseNvidiaMetrics(''), /GPU name/);
    assert.throws(() => parseNvidiaMetrics('1, 1, 2, 3, A\n2, 1, 2, 3, B'), /one NVIDIA/);
});

function fixture(run) {
    let time = 0;
    let sample = 0;
    const host = {
        cpus: () => [{ times: { idle: 100 + 50 * sample, user: 100 + 150 * sample++ } }],
        totalmem: () => 1000, freemem: () => 250,
    };
    return { monitor: createSystemMetricsMonitor({ host, run, now: () => time }), advance: () => { time += 1001; } };
}

test('collection gives physical RAM usage, deduplicates concurrent IPC and caches for a second', async () => {
    let calls = 0;
    const { monitor, advance } = fixture(async (command, args, options) => {
        calls++;
        assert.equal(command, 'nvidia-smi');
        assert.ok(args.includes('--id=0'));
        assert.equal(options.timeout, 2000);
        assert.equal(options.windowsHide, true);
        return { stdout: '45, 6553.6, 8192, 51, RTX 3070' };
    });
    const [a, b] = await Promise.all([monitor.getSnapshot(), monitor.getSnapshot()]);
    assert.equal(a, b);
    assert.equal(a.cpuPercent, 75);
    assert.equal(a.ramPercent, 75);
    assert.equal(a.gpuTemperatureC, 51);
    assert.deepEqual(a.errors, []);
    await monitor.getSnapshot();
    assert.equal(calls, 1);
    advance();
    await monitor.getSnapshot();
    assert.equal(calls, 2);
});

test('missing GPU tools and query failures leave CPU/RAM live and expose errors', async () => {
    for (const code of ['ENOENT', 'ETIMEDOUT']) {
        const { monitor } = fixture(async () => { throw Object.assign(new Error('Query unavailable'), { code }); });
        const result = await monitor.getSnapshot();
        assert.equal(result.cpuPercent, 75);
        assert.equal(result.ramPercent, 75);
        assert.equal(result.gpuPercent, null);
        assert.equal(result.vramPercent, null);
        assert.equal(result.gpuTemperatureC, null);
        assert.equal(result.errors.length, 1);
        assert.match(result.errors[0], code === 'ENOENT' ? /not installed/ : /query failed/);
    }
});

test('failed GPU refresh clears prior values rather than showing stale readings', async () => {
    let calls = 0;
    const { monitor, advance } = fixture(async () => {
        if (++calls > 1) throw new Error('Driver query failed');
        return { stdout: '45, 6553.6, 8192, 51, RTX 3070' };
    });
    assert.equal((await monitor.getSnapshot()).gpuPercent, 45);
    advance();
    const failed = await monitor.getSnapshot();
    assert.equal(failed.gpuPercent, null);
    assert.equal(failed.vramPercent, null);
    assert.equal(failed.gpuTemperatureC, null);
    assert.match(failed.errors[0], /Driver query failed/);
});
