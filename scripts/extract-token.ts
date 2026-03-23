/**
 * Extract Discord user token from a running browser session using Playwriter.
 *
 * Discord stores the token exclusively in JavaScript memory (not cookies,
 * localStorage, or IndexedDB). We extract it via the internal webpack
 * module that exposes getToken().
 *
 * Usage:
 *   bun scripts/extract-token.ts
 *   bun scripts/extract-token.ts --browser "browser:Ghost"
 */

import { execSync } from 'node:child_process'

const browserFlag = process.argv.includes('--browser')
	? `--browser "${process.argv[process.argv.indexOf('--browser') + 1]}"`
	: ''

function playwriter(sessionId: string, code: string): string {
	const escaped = code.replace(/'/g, "'\\''")
	return execSync(`playwriter -s ${sessionId} -e '${escaped}'`, {
		encoding: 'utf-8',
		timeout: 30_000,
	}).trim()
}

// --browser flag only applies to session new
const sessionOutput = execSync(`playwriter session new ${browserFlag}`, {
	encoding: 'utf-8',
	timeout: 15_000,
}).trim()
const sessionId = sessionOutput.match(/Session (\d+) created/)?.[1]
if (!sessionId) {
	console.error('Failed to create session:', sessionOutput)
	process.exit(1)
}

// Find Discord tab or navigate to it
const pages = playwriter(sessionId, 'context.pages().map(p => p.url())')
const hasDiscord = pages.includes('discord.com')

if (!hasDiscord) {
	console.log('No Discord tab found, navigating...')
	playwriter(
		sessionId,
		`state.page = context.pages()[0] ?? (await context.newPage());
		await state.page.goto("https://discord.com/channels/@me", { waitUntil: "domcontentloaded" });
		await waitForPageLoad({ page: state.page, timeout: 8000 });`,
	)
} else {
	playwriter(sessionId, 'state.page = context.pages().find(p => p.url().includes("discord.com"));')
}

// Extract token from Discord's internal webpack modules
const output = playwriter(
	sessionId,
	`const token = await state.page.evaluate(() => {
		let t = null;
		webpackChunkdiscord_app.push([["__extract__"], {}, (e) => {
			for (const k in e.c) {
				if (e.c[k]?.exports?.default?.getToken) t = e.c[k].exports.default.getToken();
			}
		}]);
		return String(t);
	});
	console.log("TOKEN:" + token);`,
)

const token = output.match(/TOKEN:(.+)/)?.[1]
if (!token || token === 'null') {
	console.error('Failed to extract token. Make sure Discord is logged in.')
	process.exit(1)
}

// Decode user ID from token (first part is base64-encoded user ID)
const userId = Buffer.from(token.split('.')[0]!, 'base64').toString()

console.log(`User ID: ${userId}`)
console.log(`Token (${token.length} chars): ${token}`)
