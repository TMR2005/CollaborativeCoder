const Redis = require('ioredis');
const dotenv = require('dotenv');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const crypto = require('crypto');

dotenv.config();

const redis = new Redis(process.env.REDIS_URL);

redis.on('error', err => {
  console.error('❌ Redis Error:', err);
});

const LANGUAGE_CONFIG = {
  python: {
    extension: 'py',

    run: filepath => ({
      command: 'python3',
      args: [filepath]
    })
  },

  javascript: {
    extension: 'js',

    run: filepath => ({
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

const EXECUTION_TIMEOUT = 5000;
const MAX_OUTPUT = 50000;

function truncateOutput(output = '') {
  if (output.length > MAX_OUTPUT) {
    return output.slice(0, MAX_OUTPUT)
      + '\n...output truncated';
  }

  return output;
}

function execute(command, args, input, timeout, cwd) {
  return new Promise(resolve => {

    const proc = spawn(command, args, {
      cwd
    });

    let stdout = '';
    let stderr = '';
    let killed = false;

    const timer = setTimeout(() => {
      killed = true;
      proc.kill('SIGKILL');
    }, timeout);

    proc.stdout.on('data', data => {
      stdout += data.toString();
    });

    proc.stderr.on('data', data => {
      stderr += data.toString();
    });

    proc.on('close', code => {
      clearTimeout(timer);

      if (killed) {
        return resolve({
          success: false,
          stderr: 'Time Limit Exceeded'
        });
      }

      resolve({
        success: code === 0,
        stdout: truncateOutput(stdout),
        stderr: truncateOutput(stderr)
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

  const tempDir = path.join(
    os.tmpdir(),
    `exec-${jobId}`
  );

  await fs.mkdir(tempDir, {
    recursive: true
  });

  try {

    const filename = `main.${config.extension}`;

    const filepath = path.join(
      tempDir,
      filename
    );

    await fs.writeFile(filepath, sourceCode);

    /* ============================
       Compile Step
    ============================ */

    if (config.compile) {

      const compileCmd = config.compile(
        filepath,
        tempDir
      );

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
          output: compileResult.stderr
        };
      }
    }

    /* ============================
       Run Step
    ============================ */

    const runCmd = config.run(
      filepath,
      tempDir
    );

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
        output: runResult.stderr
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
      console.error(cleanupErr);
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

    console.log(`⚡ Processing ${jobId}`);

    const result = await runCode(
      sourceCode,
      language,
      input
    );

    const payload = {
      jobId,
      roomId,
      status: result.type,
      output: result.output
    };

    await redis.publish(
      'job_results',
      JSON.stringify(payload)
    );

    console.log(`✅ Finished ${jobId}`);

  } catch (err) {

    console.error(err);

    if (parsed?.roomId) {

      await redis.publish(
        'job_results',
        JSON.stringify({
          roomId: parsed.roomId,
          status: 'error',
          output: err.message
        })
      );
    }
  }
}

async function startWorker() {

  console.log('🚀 Worker Started');

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

      await new Promise(r =>
        setTimeout(r, 1000)
      );
    }
  }
}

startWorker();
