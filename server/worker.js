const Redis = require('ioredis');
const axios = require('axios');
const dotenv = require('dotenv');
dotenv.config();

const REDIS_URL = process.env.REDIS_URL;

if (!REDIS_URL) {
  console.error('❌ REDIS_URL environment variable is not set');
  process.exit(1);
}

const redis = new Redis(REDIS_URL);

redis.on('error', (err) => {
  console.error('❌ Worker Redis connection error:', err);
});

async function processSubmission(submission) {
    let jobId, roomId;
    
    try {
        const parsed = JSON.parse(submission);
        jobId = parsed.jobId;
        roomId = parsed.roomId;
        const { sourceCode, language, input } = parsed;

        console.log(`Processing Job: ${jobId}`);

        if (!sourceCode || !language || !roomId) {
            throw new Error('Missing required fields in submission');
        }

        let output;
        
        try {
            output = await runCodeWithPiston(sourceCode, language, input);
        } catch (error) {
            console.error("Execution Error:", error);
            output = "Error executing code: " + (error.message || "Unknown error");
        }

        // Publish Result
        const result = JSON.stringify({
            jobId,
            roomId,
            output,
            status: "success"
        });

        await redis.publish('job_results', result);
        console.log(`Finished Job: ${jobId}`);
    } catch (error) {
        console.error("Error processing submission:", error);
        
        // Try to publish error result if we have roomId
        if (roomId) {
            try {
                const errorResult = JSON.stringify({
                    jobId: jobId || 'unknown',
                    roomId,
                    output: "Error: Failed to process submission",
                    status: "error"
                });
                await redis.publish('job_results', errorResult);
            } catch (pubError) {
                console.error("Failed to publish error result:", pubError);
            }
        }
    }
}

async function runCodeWithPiston(sourceCode, language, input) {
    // 1. Map our simple language names to Piston's specific versions
    // You can check supported versions here: https://emkc.org/api/v2/piston/runtimes
    const languageMap = {
        'python': { language: 'python', version: '3.10.0' },
        'cpp': { language: 'c++', version: '10.2.0' },
        'javascript': { language: 'javascript', version: '18.15.0' } // Bonus: JS Support
    };

    const target = languageMap[language];
    
    if (!target) {
        return "Error: Unsupported Language";
    }

    // 2. Call the API
    try {
        const response = await axios.post('https://emkc.org/api/v2/piston/execute', {
            language: target.language,
            version: target.version,
            files: [
                {
                    content: sourceCode
                }
            ],
            stdin: input || "", // Pass the user input here
            args: [],
            compile_timeout: 10000,
            run_timeout: 3000,
            memory_limit: 128 * 1024 * 1024, // 128MB
        });

        const { run, compile } = response.data;

        // 3. Handle Compilation Errors (mostly for C++)
        if (compile && compile.stderr) {
            return `Compilation Error:\n${compile.stderr}`;
        }

        // 4. Handle Runtime Output/Errors
        // Piston separates stdout (success) and stderr (errors)
        if (run.stderr) {
            return run.stderr;
        }
        
        return run.stdout;

    } catch (error) {
        console.error("Piston API Error:", error.message);
        return "Error: Failed to connect to execution engine.";
    }
}

async function startWorker() {
    console.log("Worker started. Listening for jobs...");

    while (true) {
        try {
            const response = await redis.blpop('submission_queue', 0);
            if (response) {
                const submission = response[1];
                await processSubmission(submission);
            }
        } catch (error) {
            console.error("Worker Error:", error);
            // Wait a bit before retrying to avoid tight error loop
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
}

startWorker();