const express = require('express');
const app = express(); // Changed from router to app
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Octokit 및 createAppAuth는 ESM-only → 동적 import 사용
let appOctokit;
let octokit;

// Gemini API 초기화
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Add middleware for parsing request bodies
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

async function initAppOctokit() {
  if (!appOctokit) {
    const { Octokit } = await import('octokit');
    const { createAppAuth } = await import('@octokit/auth-app');

    appOctokit = new Octokit({
      authStrategy: createAppAuth,
      auth: {
        appId: process.env.APP_ID,
        privateKey: process.env.PRIVATE_KEY,
      },
    });
  }
}

async function generateReview(diff) {
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  const prompt = `
    Please review the following code changes and provide feedback.
    Focus on potential bugs, performance issues, style violations, and areas for improvement.

    **Changed Code (diff format):**
    ${diff}
  `;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error('Error generating review:', error.message, error.stack);
    return 'Error: Could not generate code review.';
  }
}

async function postReviewComment(owner, repo, prNumber, comment) {
  try {
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body: comment,
    });
    console.log(`Successfully posted a comment on PR #${prNumber}`);
  } catch (error) {
    console.error(`Error posting comment on PR #${prNumber}:`, error);
  }
}

/* GET test endpoint. */
app.get('/', (req, res) => {
  res.status(200).send('Hello from Webhook!');
});

/* POST github webhook. */
app.post('/', async (req, res, next) => {
  const event = req.headers['x-github-event'];
  const payload = req.body;

  console.log(`Received a ${event} event`);

  if (event === 'pull_request' && (payload.action === 'opened' || payload.action === 'synchronize')) {
    const pr = payload.pull_request;
    const owner = payload.repository.owner.login;
    const repo = payload.repository.name;
    const prNumber = pr.number;

    try {
      await initAppOctokit();

      const installationId = payload.installation.id;
      const { token } = await appOctokit.auth({
        type: 'installation',
        installationId: installationId,
      });

      const { Octokit } = await import('octokit');
      octokit = new Octokit({ auth: token });

      const { data: pullRequestDiff } = await octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: prNumber,
        mediaType: { format: 'diff' },
      });

      console.log('--- PR Diff ---');
      console.log(pullRequestDiff);
      console.log('--- End of PR Diff ---');

      const review = await generateReview(pullRequestDiff);
      console.log('--- Generated Review ---');
      console.log(review);
      console.log('--- End of Generated Review ---');

      await postReviewComment(owner, repo, prNumber, review);
    } catch (error) {
      console.error('Error processing webhook:', error);
      return res.status(500).send('Error processing webhook');
    }
  }

  res.status(200).send('OK');
});

// Catch-all for debugging 404s
app.use((req, res) => {
  console.log(`Unhandled request: ${req.method} ${req.url}`);
  res.status(404).send('Not Found');
});

module.exports = app;