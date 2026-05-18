const Redis = require('ioredis');
const dotenv = require('dotenv');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const crypto = require('crypto');

dotenv.config();

const REDIS_URL = process.env.REDIS_URL;

if (!REDIS_URL) {
    console.error('❌ REDIS_URL not set');
    process.exit(1);
}

const redis = new Redis(REDIS_URL);

redis.on('error', (err) => {
    console.error('❌ Redis Error:', err);
});

const LANGUAGE_CONFIG = {
    python: {
        extension: 'py',
        run: (filepath) => ({
            command: 'python3',
            args: [filepath]
        })
    },

    javascript: {
        extension: 'js',
        run: (filepath) => ({
            command: 'node',
            args: [filepath]
        })
    },

    cpp: {
        extension: 'cpp',

        compile: (filepath, dir) => ({
            command: 'g++',
            args: [
                filepath,
                '-O2',
                '-std=c++17',
                '-o',
                path.join(dir, 'main')
            ]
        }),

        run: (_, dir) => ({
            command: path.join(dir, 'main'),
            args: []
        })
    }
};

const MAX_OUTPUT = 50000;
const EXECUTION_TIMEOUT = 5000;

function truncateOutput(output = '') {
    if (output.length > MAX_OUTPUT) {
        return output.slice(0, MAX_OUTPUT) + '\n...output truncated';
    }
    return output;
}

function execute(command, args, input, timeout, cwd) {
    return new Promise((resolve) => {
        const proc = spawn(command, args, {
            cwd,
            detached: false
        });

        let stdout = '';
        let stderr = '';
        let killed = false;

        const timer = setTimeout(() => {
            killed = true;
            proc.kill('SIGKILL');
        }, timeout);

        proc.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        proc.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        proc.on('close', (code) => {
            clearTimeout(timer);

            if (killed) {
                return resolve({
                    success: false,
                    error: 'Time Limit Exceeded'
                });
            }

            resolve({
                success: code === 0,
                stdout: truncateOutput(stdout),
                stderr: truncateOutput(stderr),
                code
            });
        });

        if (input) {
            proc.stdin.write(input);
        }

        proc.stdin.end();
    });
}

async function runCode(sourceCode, language, input = '') {
    const config = LANGUAGE_CONFIG[language];

    if (!config) {
        return {
            type: 'error',
            output: 'Unsupported language'
        };
    }

    const jobId = crypto.randomUUID();

    const tempDir = path.join(os.tmpdir(), `exec-${jobId}`);

    await fs.mkdir(tempDir, { recursive: true });

    try {
        const filename = `main.${config.extension}`;
        const filepath = path.join(tempDir, filename);

        await fs.writeFile(filepath, sourceCode);

        // Compile Step (for C++)
        if (config.compile) {
            const compileCmd = config.compile(filepath, tempDir);

            const compileResult = await execute(
                compileCmd.command,
                compileCmd.args,
                '',
                10000,
                tempDir
            );

            if (!compileResult.success) {
                return {
                    type: 'compile_error',
                    output: compileResult.stderr || 'Compilation failed'
                };
            }
        }

        // Run Step
        const runCmd = config.run(filepath, tempDir);

        const runResult = await execute(
            runCmd.command,
            runCmd.args,
            input,
            EXECUTION_TIMEOUT,
            tempDir
        );

        if (!runResult.success) {
            return {
                type: 'runtime_error',
                output: runResult.stderr || 'Runtime Error'
            };
        }

        return {
            type: 'success',
            output: runResult.stdout || ''
        };

    } catch (err) {
        console.error(err);

        return {
            type: 'internal_error',
            output: err.message
        };

    } finally {
        try {
            await fs.rm(tempDir, {
                recursive: true,
                force: true
            });
        } catch (cleanupErr) {
            console.error('Cleanup Error:', cleanupErr);
        }
    }
}

async function processSubmission(submission) {
    let parsed;

    try {
        parsed = JSON.parse(submission);

        const {
            jobId,
            roomId,
            sourceCode,
            language,
            input
        } = parsed;

        console.log(`⚡ Processing Job ${jobId}`);

        if (!jobId || !roomId || !sourceCode || !language) {
            throw new Error('Missing required fields');
        }

        if (sourceCode.length > 50000) {
            throw new Error('Code too large');
        }

        const result = await runCode(
            sourceCode,
            language,
            input
        );

        await redis.publish(
            'job_results',
            JSON.stringify({
                jobId,
                roomId,
                status: result.type,
                output: result.output
            })
        );

        console.log(`✅ Finished Job ${jobId}`);

    } catch (err) {
        console.error('Processing Error:', err);

        if (parsed?.roomId) {
            await redis.publish(
                'job_results',
                JSON.stringify({
                    jobId: parsed.jobId,
                    roomId: parsed.roomId,
                    status: 'error',
                    output: err.message
                })
            );
        }
    }
}

async function startWorker() {
    console.log('🚀 Worker started');

    while (true) {
        try {
            const response = await redis.blpop(
                'submission_queue',
                0
            );

            if (response) {
                const submission = response[1];
                await processSubmission(submission);
            }

        } catch (err) {
            console.error('Worker Loop Error:', err);

            await new Promise((r) =>
                setTimeout(r, 1000)
            );
        }
    }
}

startWorker();
