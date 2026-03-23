/**
 * Search Discord messages in a guild using the user account search API.
 * This endpoint (GET /guilds/:id/messages/search) is not available to bots.
 *
 * Usage: dotenv -e scripts/.env -- bun scripts/search-messages.ts
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { REST } from '../packages/rest/dist/index.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.join(__dirname, '.env')
for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
	const match = line.match(/^(\w+)=(.+)$/)
	if (match) {
		process.env[match[1]!] = match[2]!
	}
}

const token = process.env.DISCORD_USER_TOKEN!
const rest = new REST({ authPrefix: '' }).setToken(token)

const guildId = '1391832426048651334'
const query = process.argv[2] || 'openclaw'
const daysBack = Number(process.argv[3] || '30')

// Discord snowflake = (timestamp_ms - DISCORD_EPOCH) << 22
const DISCORD_EPOCH = 1420070400000n
const cutoff = Date.now() - daysBack * 24 * 60 * 60 * 1000
const minSnowflake = ((BigInt(cutoff) - DISCORD_EPOCH) << 22n).toString()

const params = new URLSearchParams({
	content: query,
	min_id: minSnowflake,
})

console.log(`Searching "${query}" in guild ${guildId} (last ${daysBack} days)...\n`)

const result = (await rest.get(`/guilds/${guildId}/messages/search?${params.toString()}`)) as {
	total_results: number
	messages: Array<
		Array<{
			id: string
			channel_id: string
			timestamp: string
			author: { username: string }
			content: string
		}>
	>
}

console.log(`Total results: ${result.total_results}\n`)

for (const group of result.messages.slice(0, 15)) {
	const msg = group[0]!
	const time = new Date(msg.timestamp).toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	})
	const content = msg.content.length > 120 ? msg.content.substring(0, 120) + '...' : msg.content
	console.log(`[${time}] ${msg.author.username} (ch:${msg.channel_id}):`)
	console.log(`  ${content || '(embed/attachment)'}`)
	console.log()
}
