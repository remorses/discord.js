/**
 * Test script for the discord.js selfbot fork.
 *
 * Uses @discordjs/rest with authPrefix: '' to authenticate as a user account.
 * Reads messages from a Discord channel to verify the token works.
 *
 * Usage:
 *   pnpm selfbot:test
 *
 * Env vars (in scripts/.env, loaded by dotenv-cli):
 *   DISCORD_USER_TOKEN  - bare user token (no "Bot" prefix)
 *   DISCORD_CHANNEL_ID  - channel to read messages from
 */

// Uses the local built @discordjs/rest with authPrefix: '' support
import { REST } from '../packages/rest/dist/index.mjs'
import { Routes } from 'discord-api-types/v10'
import type { APIMessage, APIUser, APIChannel } from 'discord-api-types/v10'

const token = process.env.DISCORD_USER_TOKEN
const channelId = process.env.DISCORD_CHANNEL_ID

if (!token) {
	console.error('DISCORD_USER_TOKEN not set. Add it to scripts/.env')
	process.exit(1)
}

if (!channelId) {
	console.error('DISCORD_CHANNEL_ID not set. Add it to scripts/.env')
	process.exit(1)
}

// The key change: authPrefix: '' sends the token bare, without "Bot" prefix
const rest = new REST({ authPrefix: '' }).setToken(token)

async function main() {
	console.log('--- Testing discord.js fork with user account token ---\n')

	// 1. GET /users/@me — verify we're authenticated
	console.log('1. Fetching current user...')
	const me = (await rest.get(Routes.user())) as APIUser
	console.log(`   Logged in as: ${me.username}#${me.discriminator} (${me.id})`)
	console.log(`   Global name: ${me.global_name}`)
	console.log(`   Bot: ${me.bot ?? false}`)
	console.log()

	// 2. GET /channels/:id — fetch channel info
	console.log(`2. Fetching channel ${channelId}...`)
	const channel = (await rest.get(Routes.channel(channelId))) as APIChannel
	if ('name' in channel) {
		console.log(`   Channel: #${channel.name} (type: ${channel.type})`)
	} else {
		console.log(`   Channel type: ${channel.type}`)
	}
	if ('guild_id' in channel && channel.guild_id) {
		console.log(`   Guild: ${channel.guild_id}`)
	}
	console.log()

	// 3. GET /channels/:id/messages — read last 5 messages
	console.log('3. Reading last 5 messages...')
	const messages = (await rest.get(Routes.channelMessages(channelId), {
		query: new URLSearchParams({ limit: '5' }),
	})) as APIMessage[]

	for (const msg of messages) {
		const author = `${msg.author.username}`
		const content = msg.content.length > 80 ? msg.content.substring(0, 80) + '...' : msg.content
		const time = new Date(msg.timestamp).toLocaleTimeString()
		console.log(`   [${time}] ${author}: ${content || '(embed/attachment)'}`)
	}
	console.log()

	// 4. GET /users/@me/guilds — list guilds (user-only endpoint)
	console.log('4. Listing guilds (user-only API)...')
	const guilds = (await rest.get(Routes.userGuilds())) as Array<{ id: string; name: string; owner: boolean }>
	for (const g of guilds.slice(0, 10)) {
		console.log(`   ${g.name} (${g.id})${g.owner ? ' [owner]' : ''}`)
	}
	if (guilds.length > 10) {
		console.log(`   ... and ${guilds.length - 10} more`)
	}
	console.log()

	console.log('All tests passed.')
}

main().catch((err) => {
	console.error('Failed:', err)
	process.exit(1)
})
