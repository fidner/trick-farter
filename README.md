# trick farter

A discord bot designed for trick management.

## Setup

1. Clone the repository
   ```bash
   git clone https://github.com/fidner/trick-farter.git
   cd trick-farter
   ```
2. Install dependencies
   ```bash
   npm install
   ```
3. Rename config.json.example to config.json, and add your server(s) details
   ```json
   {
   "servers": {
    "guildIdHere": {
      "verifierId": "verifierIdHere",
      "loggingId": "logChannelIdHere",
      "storageId": "storageChannelIdHere"
    }
   ```
4. Rename .env.example to .env and put your bots Token and Client ID in there
   ```.env
   TOKEN=your-token-here
   CLIENT_ID=your-client-id-here
   ```
5. Add your SQL database, ensuring it includes the following (order matters)
   ```
   name
   acronym
   aliases
   creator
   date
   type
   zone
   video
   ```
6. Run the bot
   ```bash
   npm start
   ```
