const Redis = require('ioredis');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const redis = new Redis();

// ... imports (Redis, fs, path, exec) ...

function runCodeInDocker(jobId, sourceCode, language, input) {
    return new Promise((resolve, reject) => {
        const tempDir = path.join(__dirname, 'temp');
        
        // 1. Determine file extension and Docker image based on language
        let fileExtension, image, runCommand;

        switch (language) {
            case 'python':
                fileExtension = 'py';
                image = 'python:3.9-slim';
                // Python just runs the file
                runCommand = `python3 /app/${jobId}.py < /app/${jobId}.txt`;
                break;
            
            case 'cpp':
                fileExtension = 'cpp';
                image = 'gcc:latest';
                // C++: Compile first (&&) then Run
                // -o /app/out.exe names the executable
                runCommand = `g++ /app/${jobId}.cpp -o /app/out.exe && /app/out.exe < /app/${jobId}.txt`;
                break;

            default:
                return resolve("Error: Unsupported Language");
        }

        const fileName = `${jobId}.${fileExtension}`;
        const inputFile = `${jobId}.txt`;

        const filePath = path.join(tempDir, fileName);
        const inputPath = path.join(tempDir, inputFile);

        // 2. Write files
        fs.writeFileSync(filePath, sourceCode);
        fs.writeFileSync(inputPath, input);

        const containerPath = '/app';
        const mountPath = path.join(process.cwd(), 'temp');

        // 3. Construct the Docker Command
        // We wrap everything in /bin/sh -c so we can use && and < operators
        const dockerCmd = `docker run --rm -v "${mountPath}:${containerPath}" ${image} /bin/sh -c "${runCommand}"`;

        console.log(`Running [${language}]: ${dockerCmd}`);

        exec(dockerCmd, { timeout: 10000 }, (error, stdout, stderr) => { // Increased timeout for compilation
            // Cleanup
            try {
                fs.unlinkSync(filePath);
                fs.unlinkSync(inputPath);
            } catch (e) {}

            if (error) {
                if (error.killed) return resolve("Error: Time Limit Exceeded");
                // For C++, stderr often contains the compilation errors, which the user needs to see!
                return resolve(stderr || error.message);
            }
            resolve(stdout);
        });
    });
}

// ... rest of the file (processSubmission, startWorker) ...

async function processSubmission(submission) {
    const { jobId, sourceCode, language, roomId,input } = JSON.parse(submission);

    console.log(`Processing Job: ${jobId} for Room: ${roomId}`);


    const output = await runCodeInDocker(jobId, sourceCode, language, input);

    const result = JSON.stringify({
        jobId,
        roomId,
        output: output, 
        status: "success"
    });

    await redis.publish('job_results', result);
    console.log(`Finished Job: ${jobId}`);
}

async function startWorker() {
    console.log("Worker started. Listening for jobs...");
    while (true) {
        try {
            const response = await redis.blpop('submission_queue', 0);
            if (response) {
                await processSubmission(response[1]);
            }
        } catch (error) {
            console.error("Worker Error:", error);
        }
    }
}

startWorker();