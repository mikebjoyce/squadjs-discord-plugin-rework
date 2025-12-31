# **SquadJS Discord Plugin Refactor: API Resilience & Caching**

This suite of plugins has been refactored to address chronic Discord API rate-limiting issues (HTTP 429s and Gateway timeouts) while maintaining high availability for server status updates.

## **Key Architectural Changes**

### **1\. Persistent Message Caching**

Previously, the DiscordBaseMessageUpdater performed a "Waterfall" of API calls on every update cycle (Fetching Channel \-\> Fetching Message \-\> Editing).

* **New Logic:** The plugin now initializes a messageCache (Map) during the mount() phase.  
* **Benefit:** API fetch calls are reduced by 90%. Message objects are kept in memory, and updates are performed directly on the cached object.

### **2\. Differential Update Guard ("Change Guard")**

To further conserve API quota, DiscordServerStatus now implements a comparison check before sending data to Discord.

* **New Logic:** The plugin generates the message content and compares it against a cached string of the previous update (ignoring the timestamp field).  
* **Benefit:** If player counts, map names, and team scores haven't changed, the plugin skips the API edit call entirely.

### **3. Separated Update Timers**

The bot's presence (Gateway traffic) and the status message (HTTP traffic) now use independent timer instances.

* **New Logic:** 
  - **Message Updates:** Uses `setInterval` for embed edits (default: 2 minutes)
  - **Bot Status:** Uses separate `setInterval` for presence updates (same frequency)
* **Benefit:** Independent timers prevent cascading failures if one operation stalls. Future configs can easily adjust frequencies separately.

### **4\. Dynamic Rate-Limiting (Gold Standard)**

In `DiscordBasePlugin`, the error handling for 429s has been upgraded to be fully compliant with Discord's API standards.

* **New Logic:** Instead of ignoring rate limits or using a fixed delay, the plugin now parses the `retry-after` header (or error property) to wait exactly as long as Discord requests before retrying.
* **Benefit:** Maximizes throughput while strictly adhering to API limits, preventing "Global Rate Limit" bans.

### **5\. Database Self-Healing**

The `DiscordBaseMessageUpdater` now performs a sanity check on startup.

* **New Logic:** During `prepareToMount()`, it verifies that all subscribed messages in the database actually exist in Discord. If a message returns Error 10008 (Unknown Message), it is immediately pruned from the database.
* **Benefit:** Prevents the bot from getting stuck in error loops trying to update messages that were manually deleted by server admins.

### **6\. Telemetry & Proactive Debugging**

Visibility into the plugin's performance is now built-in.

* **New Logic:** The plugin tracks `updatesSent` vs `updatesSkipped` and logs a summary every 10 update cycles. It also listens for and logs raw Discord `rateLimit` events.
* **Benefit:** Allows server owners to see exactly how much API quota is being saved by the caching and change-guard systems.

## **Technical Implementation Details**

| Component | Method | Improvement |
| :--- | :--- | :--- |
| **DiscordBasePlugin** | `sendDiscordMessage` | **Dynamic Rate-Limiting**: Implemented wait logic based on `retry-after` headers. |
| **DiscordBaseMessageUpdater** | `prepareToMount` | **Self-Healing**: Added validation loop to prune dead (10008) messages. |
| **DiscordBaseMessageUpdater** | `mount` | **Debugging**: Added `rateLimit` event listener for visibility. |
| **DiscordBaseMessageUpdater** | `updateMessages` | **Performance**: Iterates over messageCache instead of fetching channels/messages per loop.
| **DiscordServerStatus** | `updateMessages` | **Efficiency**: Implemented `lastCacheString` JSON comparison logic. |
| **DiscordServerStatus** | `updateStatus` | **Telemetry**: Added summary logging (Sent vs Skipped) for performance tracking. |



## **Usage Recommendations**

* **Update Interval:** Keep updateInterval at or above 120000 (2 minutes) for optimal stability.  
* **Verbose Logging:** Use verbose(1) to monitor "Rate Limit Hit" logs and "Change Guard" skips for debugging.

## Reworked by **Slacker**
```
Discord: `real_slacker`
Email: `mike.b.joyce@gmail.com`
GitHub: https://github.com/mikebjoyce
```