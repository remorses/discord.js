/**
 * Extract Discord user token from a running browser session using Playwriter.
 *
 * The token is captured by reloading an open Discord tab and intercepting
 * the Authorization header from outgoing API requests. This is the same
 * token the browser client uses internally — no password or 2FA needed,
 * just an already-logged-in Discord session.
 *
 * Usage:
 *   npx tsx scripts/extract-token.ts
 *   npx tsx scripts/extract-token.ts --browser "browser:Ghost"
 *
 * Requirements:
 *   - Chrome or Ghost Browser running with Playwriter extension enabled
 *   - A Discord tab open and logged in
 *   - playwriter CLI installed (npm i -g playwriter@latest)
 */

import { execSync } from 'node:child_process'

const browserFlag = process.argv.includes('--browser')
	? process.argv[process.argv.indexOf('--browser') + 1]
	: undefined

function run(cmd: string): string {
	return execSync(cmd, { encoding: 'utf-8', timeout: 30_000 }).trim()
}

function playwriter(sessionId: string, code: string): string {
	const browserArg = browserFlag ? ` --browser "${browserFlag}"` : ''
	// Use heredoc to avoid shell quoting issues
	const cmd = `playwriter -s ${sessionId}${browserArg} -e "$(cat <<'PLAYWRITER_EOF'\n${code}\nPLAYWRITER_EOF\n)"`
	return run(cmd)
}

async function main() {
	console.log('Creating playwriter session...')
	const browserArg = browserFlag ? ` --browser "${browserFlag}"` : ''
	const sessionOutput = run(`playwriter session new${browserArg}`)
	const sessionMatch = sessionOutput.match(/Session (\d+) created/)
	if (!sessionMatch) {
		console.error('Failed to create session:', sessionOutput)
		process.exit(1)
	}

	const sessionId = sessionMatch[1]!
	console.log(`Session ${sessionId} created`)

	// Find a Discord tab
	console.log('Looking for Discord tab...')
	const pagesOutput = playwriter(
		sessionId,
		`
const urls = context.pages().map(p => p.url());
const discordPage = context.pages().find(p => p.url().includes("discord.com/channels"));
if (!discordPage) {
  console.log("NO_DISCORD_TAB");
  console.log("Open tabs:", urls.join(", "));
} else {
  console.log("FOUND:" + discordPage.url());
}
`,
	)

	if (pagesOutput.includes('NO_DISCORD_TAB')) {
		console.error('No Discord tab found. Open discord.com in the browser and log in first.')
		console.error(pagesOutput)
		process.exit(1)
	}

	// Capture token by reloading the page and intercepting API requests
	console.log('Capturing token from API requests...')
	const tokenOutput = playwriter(
		sessionId,
		`
state.page = context.pages().find(p => p.url().includes("discord.com"));
state.capturedToken = null;

const handler = (req) => {
  if (!state.capturedToken && req.url().includes("discord.com/api")) {
    const auth = req.headers()["authorization"];
    if (auth && !auth.startsWith("Bot ")) {
      state.capturedToken = auth;
    }
  }
};
state.page.on("request", handler);
await state.page.reload({ waitUntil: "domcontentloaded" });
await state.page.waitForTimeout(4000);
state.page.removeListener("request", handler);

if (state.capturedToken) {
  console.log("TOKEN:" + state.capturedToken);
} else {
  console.log("TOKEN_FAILED");
}
`,
	)

	const tokenMatch = tokenOutput.match(/TOKEN:(.+)/)
	if (!tokenMatch) {
		console.error('Failed to capture token. Make sure Discord is logged in.')
		console.error(tokenOutput)
		process.exit(1)
	}

	const token = tokenMatch[1]!
	console.log(`\nToken captured (${token.length} chars):`)
	console.log(token)
	console.log(`\nToken preview: ${token.substring(0, 30)}...`)

	// Also grab cookies
	console.log('\nGrabbing cookies...')
	const cookieOutput = playwriter(
		sessionId,
		`
const cdp = await getCDPSession({ page: state.page });
const { cookies } = await cdp.send("Network.getCookies", { urls: ["https://discord.com"] });
console.log("COOKIES:" + JSON.stringify(cookies.map(c => ({ name: c.name, value: c.value, httpOnly: c.httpOnly, secure: c.secure }))));
`,
	)

	const cookieMatch = cookieOutput.match(/COOKIES:(.+)/)
	if (cookieMatch) {
		const cookies = JSON.parse(cookieMatch[1]!) as Array<{
			name: string
			value: string
			httpOnly: boolean
			secure: boolean
		}>
		console.log(`Found ${cookies.length} cookies:`)
		for (const c of cookies) {
			console.log(`  ${c.name}: ${c.value.substring(0, 40)}...`)
		}
	}

	console.log('\n--- Usage with discord.js fork ---')
	console.log("const { REST } = require('@discordjs/rest');")
	console.log(`const rest = new REST({ authPrefix: '' }).setToken('${token.substring(0, 20)}...');`)
}

main().catch((err) => {
	console.error(err)
	process.exit(1)
})
