import {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    StringSelectMenuBuilder,
    ChannelType,
    PermissionFlagsBits,
    SlashCommandBuilder,
    ActivityType,
} from "discord.js";
import { existsSync, mkdirSync, writeFileSync, unlinkSync, readFileSync } from "fs";
import dotenv from "dotenv";
import express from "express";
import path from "path";

dotenv.config();

if (!existsSync("./transcripts")) mkdirSync("./transcripts");

const CLOCK_DATA_FILE = './clock_data.json';
function loadClockData() {
    if (existsSync(CLOCK_DATA_FILE)) {
        return JSON.parse(readFileSync(CLOCK_DATA_FILE, 'utf8'));
    }
    return {};
}
function saveClockData(data) {
    writeFileSync(CLOCK_DATA_FILE, JSON.stringify(data, null, 2));
}

const app = express();
app.use(express.json());
app.use(express.static('html'));
app.get('/', (req, res) => {
    res.sendFile(path.join(process.cwd(), '/html/index.html'));
});
app.get('/clock', (req, res) => {
    res.sendFile(path.join(process.cwd(), '/html/clock/index.html'));
});
app.post('/signoff', async (req, res) => {
    try {
        let { naam, startdatum, eindatum, reden } = req.body;
        // Format dates to DD-MM-YYYY
        if (startdatum) startdatum = startdatum.split('-').reverse().join('-');
        if (eindatum) eindatum = eindatum.split('-').reverse().join('-');
        const logChannel = await client.channels.fetch(AFMELDINGEN_LOGS_ID);
        if (logChannel && logChannel.isTextBased()) {
            const embed = new EmbedBuilder()
                .setTitle('Staff Afmelding')
                .setColor('DarkGreen')
                .addFields(
                    { name: 'Naam', value: naam, inline: true },
                    { name: 'Startdatum', value: startdatum, inline: true },
                    { name: 'Eindatum', value: eindatum, inline: true },
                    { name: 'Reden', value: reden, inline: false }
                )
                .setTimestamp();
            await logChannel.send({ embeds: [embed] });
        }
        res.send('Afmelden gelukt.');
    } catch (error) {
        console.error('Error in signoff:', error);
        res.status(500).send('Fout bij afmelden.');
    }
});

app.post('/clockin', async (req, res) => {
    try {
        const { naam } = req.body;
        const data = loadClockData();
        if (!data[naam]) data[naam] = { totalTime: 0, clockedIn: null };
        if (data[naam].clockedIn) {
            return res.status(400).send('Je bent al ingeklokt.');
        }
        data[naam].clockedIn = Date.now();
        saveClockData(data);

        // Log to Discord
        const logChannel = await client.channels.fetch(CLOCKIN_LOGS_ID);
        if (logChannel && logChannel.isTextBased()) {
            const embed = new EmbedBuilder()
                .setTitle('Staff Clock In')
                .setColor('DarkGreen')
                .addFields({ name: 'Naam', value: naam, inline: true })
                .setTimestamp();
            await logChannel.send({ embeds: [embed] });
        }

        res.send('Succesvol ingeklokt.');
    } catch (error) {
        console.error('Error in clockin:', error);
        res.status(500).send('Fout bij inklokken.');
    }
});

app.post('/clockout', async (req, res) => {
    try {
        const { naam } = req.body;
        const data = loadClockData();
        if (!data[naam] || !data[naam].clockedIn) {
            return res.status(400).send('Je bent niet ingeklokt.');
        }
        const duration = Math.floor((Date.now() - data[naam].clockedIn) / 1000);
        data[naam].totalTime += duration;
        data[naam].clockedIn = null;
        saveClockData(data);

        // Log to Discord
        const logChannel = await client.channels.fetch(CLOCKIN_LOGS_ID);
        if (logChannel && logChannel.isTextBased()) {
            const embed = new EmbedBuilder()
                .setTitle('Staff Clock Out')
                .setColor('Red')
                .addFields(
                    { name: 'Naam', value: naam, inline: true },
                    { name: 'Duur', value: `${Math.floor(duration / 3600)}u ${Math.floor((duration % 3600) / 60)}m ${duration % 60}s`, inline: true }
                )
                .setTimestamp();
            await logChannel.send({ embeds: [embed] });
        }

        res.send(`Succesvol uitgeklokt. Dienst duur: ${Math.floor(duration / 3600)}u ${Math.floor((duration % 3600) / 60)}m ${duration % 60}s`);
    } catch (error) {
        console.error('Error in clockout:', error);
        res.status(500).send('Fout bij uitklokken.');
    }
});

app.get('/leaderboard', (req, res) => {
    try {
        const data = loadClockData();
        const leaderboard = Object.entries(data)
            .map(([name, info]) => ({ name, totalTime: info.totalTime }))
            .sort((a, b) => b.totalTime - a.totalTime);
        res.json(leaderboard);
    } catch (error) {
        console.error('Error in leaderboard:', error);
        res.status(500).json([]);
    }
});

app.listen(8123, () => console.log('Website draait op poort 8123'));

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent
    ]
});

const TICKET_CATEGORY_ID = "1371797660587135107";
const LOG_CHANNEL_ID = "1366807865192353883";
const LOG_RENAME_CHANNEL_ID = "1366807865192353883";
const AFMELDINGEN_LOGS_ID = "1444756332702990439";
const CLOCKIN_LOGS_ID = "1444762871677325450";

client.once("ready", async () => {
    console.log(`${client.user.tag} is online!`);
    client.user.setActivity('Tickets', { type: ActivityType.Watching });

    const commands = [
        new SlashCommandBuilder()
            .setName("move")
            .setDescription("Verplaats het ticket naar een andere categorie.")
            .addStringOption(option =>
                option.setName("category")
                    .setDescription("Kies de nieuwe categorie")
                    .setRequired(true)
                    .addChoices(
                        { name: "Algemene Vraag", value: "algemene_vraag" },
                        { name: "Unban", value: "unban" },
                        { name: "Ingame Refund", value: "ingame_refund" },
                        { name: "Speler Klacht", value: "speler_klacht" },
                        { name: "Staff Klacht", value: "staff_klacht" },
                        { name: "Donatie", value: "donatie" },
                        { name: "Sollicitatie", value: "sollicitatie" },
                        { name: "Development", value: "development" },
                        { name: "OVC Zaken", value: "overheid_coordinator" },
                        { name: "OWC Zaken", value: "onderwereld_coordinator" },
                        { name: "Gang Aanvraag", value: "gang_aanvraag" },
                        { name: "Staff Coördinator", value: "staff_coordinator" },
                    )
            ),

        new SlashCommandBuilder()
            .setName("panel")
            .setDescription("Plaats het ticket paneel in een kanaal.")
            .addChannelOption(option =>
                option.setName("kanaal")
                    .setDescription("Kies het kanaal waar je het ticket paneel wilt plaatsen")
                    .setRequired(true)
            ),
            
        new SlashCommandBuilder()
            .setName("alert")
            .setDescription("Stuur een reminder in een ticket!")
            .addUserOption(option =>
                option.setName("user")
                    .setDescription("Wie moet de reminder krijgen?")
                    .setRequired(true)
            ),

        new SlashCommandBuilder()
            .setName("toevoegen")
            .setDescription("Voeg een gebruiker toe aan het ticket.")
            .addUserOption(option =>
                option.setName("user")
                    .setDescription("De gebruiker die je wilt toevoegen")
                    .setRequired(true)
            ),
        new SlashCommandBuilder()
            .setName("verwijderen")
            .setDescription("Verwijder een gebruiker uit het ticket.")
            .addUserOption(option =>
                option.setName("user")
                    .setDescription("De gebruiker die je wilt verwijderen")
                    .setRequired(true)
            ),
        new SlashCommandBuilder()
            .setName("sluiten")
            .setDescription("Sluit het ticket met optionele reden.")
            .addStringOption(option =>
                option.setName("reason")
                    .setDescription("De reden van het sluiten van de ticket")
                    .setRequired(false)
            ),
        new SlashCommandBuilder()
            .setName("rename")
            .setDescription("Wijzig de naam van een ticketkanaal.")
            .addStringOption(option =>
                option.setName("new_name")
                    .setDescription("De nieuwe naam voor het ticketkanaal.")
                    .setRequired(true)
            ),
        new SlashCommandBuilder()
            .setName("purge")
            .setDescription("Verwijder een aantal berichten in het ticketkanaal.")
            .addIntegerOption(option =>
                option.setName("aantal")
                    .setDescription("Het aantal berichten dat je wilt verwijderen (max 100)")
                    .setRequired(true)
                    .setMinValue(1)
                    .setMaxValue(100)
            ),
        new SlashCommandBuilder()
            .setName('wiki')
            .setDescription('Stuur een wiki naar een gebruiker namens een stafflid.')
            .addUserOption(option =>
                option.setName('gebruiker')
                .setDescription('De gebruiker waarvoor de template bedoeld is.')
                .setRequired(true))
            .addStringOption(option =>
                option.setName('template')
                .setDescription('Kies een template.')
                .setRequired(true)
                .addChoices(
                    { name: 'Algemene Vraag', value: 'algemene_vraag' },
                    { name: 'Staff Klacht', value: 'staff_klacht' },
                    { name: 'Staff Sollicitatie', value: 'staff_sollicitatie' },
                    { name: 'Refund', value: 'refund' },
                    { name: 'Unban', value: 'unban' },
                    { name: 'Overstap', value: 'staff_overstap' },
                    { name: 'Gang aanvraag', value: 'gang_aanvraag' },
                ))
            .addUserOption(option =>
                option.setName('verwijzing')
                .setDescription('Verwijzing van stafflid (optioneel)')
                .setRequired(false)
            ),
        new SlashCommandBuilder()
            .setName("refund")
            .setDescription("Verwerk een refund aanvraag.")
            .addSubcommand(sub =>
                sub.setName("goedgekeurd")
                    .setDescription("Keur een refund aanvraag goed.")
            )
            .addSubcommand(sub =>
                sub.setName("afgekeurd")
                    .setDescription("Keer een refund aanvraag af.")
                    .addStringOption(option =>
                        option.setName("reden")
                            .setDescription("De reden van afkeuring")
                            .setRequired(true)
                    ),
            ),

        new SlashCommandBuilder()
            .setName("sollicitatie")
            .setDescription("Verwerk een sollicitatie aanvraag.")
            .addSubcommand(sub =>
                sub.setName("aangenomen")
                    .setDescription("Neem een sollicitant aan.")
                    .addRoleOption(option =>
                        option.setName("rang")
                        .setDescription("De rang die de sollicitant krijgt")
                        .setRequired(true)
                    ),
            )
            .addSubcommand(sub =>
                sub.setName("afgewezen")
                    .setDescription("Weiger een sollicitant.")
                    .addStringOption(option =>
                        option.setName("reden")
                        .setDescription("De reden van afwijzing")
                        .setRequired(true) 
                    ),
            ),

        new SlashCommandBuilder()
            .setName("ontsla")
            .setDescription("Ontsla een stafflid.")
            .addUserOption(option =>
                option.setName("stafflid")
                    .setDescription("Het stafflid dat u wilt ontslaan")
                    .setRequired(true)
            )
            .addStringOption(option =>
                option.setName("reden")
                    .setDescription("De reden van ontslag")
                    .setRequired(true)
            ),

        new SlashCommandBuilder()
            .setName("prioriteit")
            .setDescription("Stel prioriteit in voor dit ticket.")
            .addIntegerOption(option =>
                option.setName("level")
                    .setDescription("Prioriteitsniveau")
                    .setRequired(true)
                    .addChoices(
                        { name: "1 - Hoog (Rood)", value: 1 },
                        { name: "2 - Middel (Oranje)", value: 2 },
                        { name: "3 - Laag (Groen)", value: 3 },
                		{ name: "Afwachtend", value: 4 }
                    )
            )

        ];

    await client.application.commands.set(commands);
    console.log("Slash-commando's zijn geregistreerd.");
});

client.on('interactionCreate', async interaction => {
    try {
        if (interaction.isChatInputCommand()) {
            if (interaction.commandName === 'wiki') {
            const gebruiker = interaction.options.getUser('gebruiker');
            let template = interaction.options.getString('template');
            template = template.toLowerCase().replace(/\s+/g, '_');
            const verwijzing = interaction.options.getUser('verwijzing');
            const executor = interaction.user;

            const gebruikerMention = gebruiker.toString();
            const executorMention = executor.toString();

            let message = '';

            
            switch (template) {
                case 'algemene_vraag':
                        message = `Beste ${gebruikerMention},\n\nGelieve de onderstaande informatie te verstrekken, zodat wij u zo snel mogelijk kunnen helpen:\n\n**Naam:**\n**Vraag:**\n\nMet vriendelijke groet,\n\n> ${executorMention}\n> Team Alkmaar RP`;
                break;

                case 'staff_klacht':
                    if (verwijzing && verwijzing.id !== gebruiker.id) {
                        message = `Beste ${gebruikerMention},\n\nAangezien u reeds een verwijzing heeft ontvangen van <@${verwijzing.id}> is het van belang dat enkel de staffcoördinatoren beschikken over de volgende informatie:\n\n**Naam:**\n**Tegen wie:**\n**Datum:**\n**Bewijs:**\n**Reden:**\n\nMet vriendelijke groet,\n\n> ${executorMention}\n> Team Alkmaar RP`;
                    } else {
                        message = `Beste ${gebruikerMention},\n\nJammer om te horen dat u een klacht heeft over ons staffteam, Wij streven ernaar ons staffteam voortdurend te verbeteren. Gelieve de onderstaande informatie te verstrekken, zodat wij u zo goed mogelijk kunnen helpen:\n\n**Naam:**\n**Tegen wie:**\n**Datum:**\n**Reden van klacht:**\n**Bewijs:**\n\nMet vriendelijke groet,\n\n> ${executorMention}\n> Team Alkmaar RP`;
                    }
                break;

                case 'staff_sollicitatie':
                    message = `Beste ${gebruikerMention},\n\nLeuk om te horen dat u wilt solliciteren voor ons staffteam!\nGelieve de onderstaande informatie in te vullen, zodat wij uw sollicitatie spoedig kunnen beoordelen:\n\n**Naam:**\n**Leeftijd:**\n**Ervaring:**\n**Motivatie:**\n**Waarom moet u staff worden en niet iemand anders:**\n**Opmerkingen:**\n\nMet vriendelijke groet,\n\n> ${executorMention}\n> Team Alkmaar RP`;
                    break;

                case 'refund':
                    if (verwijzing && verwijzing.id !== gebruiker.id) {
                        message = `Beste ${gebruikerMention},\n\nU bent doorverwezen door ${verwijzing} om een refund-aanvraag in te dienen. Zorg ervoor dat u onderstaand format correct en volledig invult zodat uw aanvraag correct en volledig kan worden verwerkt.\n\n**Naam:**\n**Datum:**\n**Reden voor refund:**\n**Bewijs:**\n\nMet vriendelijke groet,\n\n> ${executorMention}\n> Team Alkmaar RP`;
                    } else {
                        message = `Beste ${gebruikerMention},\n\nAangezien u nog niet bent geholpen door een stafflid, verzoeken wij u vriendelijk het onderstaande formulier in te vullen, zodat de refundcoördinatoren uw aanvraag in behandeling kunnen nemen:\n\n**Naam:**\n**Datum:**\n**Reden voor refund:**\n**Bewijs:**\n\nMet vriendelijke groet,\n\n> ${executorMention}\n> Team Alkmaar RP`;
                    }
                    break;

                case 'unban':
                    if (verwijzing && verwijzing.id !== gebruiker.id) {
                        message = `Beste ${gebruikerMention},\n\nAangezien u bent verbannen door ${verwijzing} verwijs ik u vriendelijk door naar deze persoon. Hij / zij zal deze ticket in behandeling nemen als hij / zij tijd heeft. Gelieve geduldig af te wachten en geen tags te gebruiken. Dit kan leiden tot vertraging of sluiting van het ticket.\n\nMet vriendelijke groet,\n\n> ${executorMention}\n> Team Alkmaar RP`;
                    } else {
                        message = `Beste ${gebruikerMention},\n\nU dient het volgende formulier in te vullen voor uw unban-aanvraag:\n\n**Naam:**\n**Ban-ID / Reden van Ban:**\n**Bewijs:**\n**Waarom zou u unbanned moeten worden:**\n\nMet vriendelijke groet,\n\n> ${executorMention}\n> Team Alkmaar RP`;
                    }
                break;

                case 'staff_overstap':
                    message = `Beste ${gebruikerMention},\n\nNaar aanleiding van uw wens om over te stappen naar het staffteam, verzoeken wij u vriendelijk om het onderstaande formulier in te vullen:\n\n**Naam:**\n**Leeftijd:**\n**Huidige / Oude Rang:**\n**Discord invite-link + Server naam:**\n**Opmerkingen:**\n\nMet vriendelijke groet,\n\n> ${executorMention}\n> Team Alkmaar RP`;
                break;

                case 'gang_aanvraag':
                    message = `Beste ${gebruikerMention},\n\nBedankt voor uw interesse in het starten van een gang, Om een aanvraag te doen, verzoeken wij u vriendelijk de onderstaande informatie in te vullen:\n\n**Naam Boss:**\n**Leeftijd Boss:**\n**Gangnaam:**\n**Opmerkingen:**\n**Aantal leden:**\n\nMet vriendelijke groet,\n\n> ${executorMention}\n> Team Alkmaar RP`;
                break;
                default:
                    message = `⚠️ Het opgegeven template bestaat niet of is ongeldig.`;
                break;
            }

            if (!message || message.trim() === "") {
                message = "⚠️ Er is iets fout gegaan bij het genereren van het bericht.";
            }

            return interaction.reply({ content: message, ephemeral: false });
        }

            if (interaction.commandName === 'prioriteit') {
                await interaction.deferReply({ ephemeral: true });

                try {
                    const level = interaction.options.getInteger("level");
                    const channel = interaction.channel;

                    if (!channel.topic || !channel.topic.startsWith("Ticket van")) {
                        return interaction.editReply({ content: "❌ Dit is geen ticketkanaal." });
                    }

                    const emojis = { 1: "🔴", 2: "🟠", 3: "🟢", 4: "⏳" };
                    const emoji = emojis[level];

                    // Remove existing priority emoji
                    const newName = `${emoji} ${channel.name.replace(/^[🔴🟠🟢⏳]\s*/, '')}`;
                    await channel.setName(newName);

                    await interaction.editReply({ content: `Prioriteit ingesteld op niveau ${level}.` });
                } catch (error) {
                    await interaction.editReply({ content: 'Er ging iets mis bij het instellen van de prioriteit.' });
                }
            }
    }

        // 1. Review button
        if (interaction.isButton()) {
            if (interaction.customId.startsWith('review_')) {
                const stars = interaction.customId.split('_')[1];

                // Stuur modal om feedback te vragen
                const modal = new ModalBuilder()
                    .setCustomId(`feedback_modal_${stars}`)
                    .setTitle('Geef uw feedback');

                const feedbackInput = new TextInputBuilder()
                    .setCustomId('feedbackInput')
                    .setLabel('Uw feedback (optioneel)')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(false);

                const firstActionRow = new ActionRowBuilder().addComponents(feedbackInput);
                modal.addComponents(firstActionRow);

                await interaction.showModal(modal);
                return;
            }
        }

        // 2. Modal submit (feedback invullen)
        if (interaction.isModalSubmit()) {
            if (interaction.customId.startsWith('feedback_modal_')) {
                const stars = interaction.customId.split('_')[2];
                const feedback = interaction.fields.getTextInputValue('feedbackInput') || 'Geen feedback opgegeven';

                // Bevestiging naar gebruiker
                await interaction.reply({ content: `✅ Bedankt voor je review van **${stars}** ster(ren) en je feedback!`, ephemeral: true });

                // Logkanaal ophalen
                const logChannel = await interaction.client.channels.fetch('1366807865192353883');
                if (logChannel) {
                    const embed = new EmbedBuilder()
                        .setTitle("⭐ Nieuwe Review ontvangen")
                        .setDescription(`${interaction.user.tag} gaf een review van **${stars}** ster(ren).`)
                        .addFields(
                            { name: 'Feedback', value: feedback }
                        )
                        .setColor('Gold')
                        .setTimestamp();

                    await logChannel.send({ embeds: [embed] });
                }
                return;
            }
        }
        if (interaction.isCommand()) {
            const { commandName } = interaction;

            if (commandName === "ontsla") {
                const stafflid = interaction.options.getUser("stafflid");
                const reden = interaction.options.getString("reden");
                const LOG_CHANNEL_ID = "1366807865192353883";
                const logChannel = await interaction.guild.channels.fetch(LOG_CHANNEL_ID);

                // Display name Reciever
                let executorDisplayName = interaction.user.username;
                try {
                    const executorMember = await interaction.guild.members.fetch(interaction.user.id);
                    if (executorMember && executorMember.displayName) {
                        executorDisplayName = executorMember.displayName;
                    }
                } catch (e) {
                    // Error Catch
                }

                // Embed voor logkanaal
                const logEmbed = new EmbedBuilder()
                    .setTitle("🚫 Ontslagen - Alkmaar Roleplay")
                    .setColor("Red")
                    .addFields(
                        { name: "Stafflid", value: `${stafflid.tag} (${stafflid.id})`, inline: true },
                        { name: "Reden", value: reden, inline: true },
                        { name: "Door", value: executorDisplayName, inline: true },
                    )
                    .setTimestamp();

                // Embed voor DM
                const dmEmbed = new EmbedBuilder()
                    .setTitle("🚫 Je bent ontslagen")
                    .setDescription("Je bent ontslagen uit het staffteam van Alkmaar Roleplay.")
                    .addFields(
                        { name: "Reden", value: reden, inline: false },
                    )
                    .setColor("DarkGreen")
                    .setTimestamp();

                // Stuur embed naar logkanaal
                if (logChannel && logChannel.isTextBased()) {
                    await logChannel.send({ embeds: [logEmbed] });
                }

                // Stuur DM naar stafflid
                try {
                    await stafflid.send({ embeds: [dmEmbed] });
                } catch (err) {
                    // Kan geen DM sturen, negeer fout
                }

                // Bevestiging naar gebruiker
                await interaction.reply({
                    content: `✅ ${stafflid} is succesvol ontslagen.`,
                    ephemeral: true
                });

                return;
            }

            if (commandName === "purge") {
                const amount = interaction.options.getInteger("aantal");
                const channel = interaction.channel;
                const supportRoleId = '1366807591472070860';

                if (channel.type !== ChannelType.GuildText) {
                    return interaction.reply({
                        content: "❌ Dit commando werkt alleen in tekstkanalen.",
                        ephemeral: true
                    });
                }

                // Alleen gebruikers met de supportrol mogen dit
                if (!interaction.member.roles.cache.has(supportRoleId)) {
                    return interaction.reply({
                        content: "❌ Je hebt geen toestemming om berichten te verwijderen. Alleen supportleden kunnen dit.",
                        ephemeral: true
                    });
                }

                try {
                    // Haal de laatste 100 berichten op
                    const messages = await channel.messages.fetch({ limit: 100 });
                    // Filter: verwijder alleen berichten die NIET de "🎫 Nieuw Ticket" embed bevatten
                    const toDelete = messages
                        .filter(msg => {
                            const hasNieuwTicketEmbed = msg.embeds.some(
                                embed => embed.title && embed.title.includes("🎫 Nieuw Ticket")
                            );
                            return !hasNieuwTicketEmbed && !msg.pinned;
                        })
                        .first(amount);

                    if (!toDelete.length) {
                        return interaction.reply({
                            content: "❌ Geen berichten gevonden om te verwijderen.",
                            ephemeral: true
                        });
                    }

                    const deleted = await channel.bulkDelete(toDelete, true);

                    await interaction.reply({
                        content: `✅ ${deleted.size} berichten verwijderd.`,
                        ephemeral: true
                    });

                    const logChannel = await interaction.guild.channels.fetch(LOG_CHANNEL_ID);
                    if (logChannel && logChannel.isTextBased()) {
                        const embed = new EmbedBuilder()
                            .setTitle("🧹 Berichten Verwijderd")
                            .addFields(
                                { name: "Kanaal", value: `${channel}`, inline: true },
                                { name: "Aantal", value: `${deleted.size}`, inline: true },
                                { name: "Door", value: `<@${interaction.user.id}>`, inline: true }
                            )
                            .setColor("DarkGreen")
                            .setTimestamp();

                        await logChannel.send({ embeds: [embed] });
                    }
                } catch (err) {
                    console.error("[PURGE] Fout bij verwijderen:", err);
                    await interaction.reply({
                        content: "❌ Er is iets misgegaan bij het verwijderen van berichten.",
                        ephemeral: true
                    });
                }
            }

            if (commandName === "refund") {
                const subCommand = interaction.options.getSubcommand();

                if (subCommand === "goedgekeurd") {
                    const embed = new EmbedBuilder()
                        .setTitle("✅ Refund Goedgekeurd")
                        .setDescription(`Beste,\n\n Bedankt voor uw refund Aanvraag, deze is ***goedgekeurd***.\n U zal zo snel mogelijk uw aangevraagde spullen gerefund krijgen van ons! \n\n Met vriendelijke groet,\n\n> ${interaction.member.displayName}\n> Alkmaar Roleplay Team`)
                        .setColor("Green")
                    await interaction.reply({ embeds: [embed]});
                }
                else if (subCommand === "afgekeurd") {
                    const reason = interaction.options.getString("reden");
                    const embed = new EmbedBuilder()
                        .setTitle("❌ Refund Afgekeurd")
                        .setDescription(`Beste,\n\n Bedankt voor uw refund Aanvraag, maar helaas is De refund aanvraag ***afgekeurd***.\n**Reden:** ${reason}\n\n Met vriendelijke groet,\n\n> ${interaction.member.displayName}`)
                        .setColor("Red")
                    await interaction.reply({ embeds: [embed]});
                }
            }

            if (commandName === "sollicitatie") {
                const subCommand = interaction.options.getSubcommand();

                if (subCommand === "aangenomen") {
                    const role = interaction.options.getRole("rang");
                    const embed = new EmbedBuilder()
                        .setTitle("✅ Sollicitatie Aangenomen")
                        .setDescription(
`Beste Sollicitant,

Bedankt voor uw sollicitatie, wij willen u feliciteren met dat u bent **aangenomen** 🎉
U wordt aangenomen op de rang ${role} door 1 van onze staff coördinatoren.
Proficiat namens heel het staffteam!

Met vriendelijke groet,
> ${interaction.member.displayName}
> Alkmaar Roleplay
> Staffcoördinator`
                        )
                        .setColor("DarkGreen");

                    const infoEmbed = new EmbedBuilder()
                        .setTitle("📢 Belangrijk")
                        .setDescription("Gelieve **alle staffregels hieronder goed te lezen** en je eraan te houden. Bij overtreding kunnen sancties volgen.\n\n Letop: U bent ook verplicht om onze discord 'guildtag' te gebruiken & ons in uw bio te zetten. Dit is verplicht voor alle staffleden. \n Voorbeeld: 'Alkmaar Roleplay | [Rang] \n https://discord.gg/cKkMbhyuTt'.")
                        .setColor("Yellow");

                    const regelsEmbed = new EmbedBuilder()
                        .setTitle("📋 Staffregels & Ingame Regels")
                        .setDescription(
`**Tickets**
・Tickets alleen behandelen als ze juist zijn ingevuld (denk aan template, clip, ban id of een screenshot van ban id)
・Reageren in elkaar tickets is niet toegestaan, alleen indien je wordt getagged door een mede stafflid
・Een ticket claimen is ook afhandelen binnen 3 dagen, reageert de desbetreffende persoon niet binnen 2 dagen sluit je de ticket (dit moet je uiteraard aangeven aan de desbetreffende persoon)
・Word je getagged door de gene die het ticket heeft gemaakt, geef je een waarschuwing dit niet meer te doen, al doet hij dit vaker, mag je de ticket sluiten met reden 'staff taggen'

**Ingame zaken (Voornamelijk voor Junior Moderator)**
・Je ingame naam moet hetzelfde zijn als in de discord bijvoorbeeld: Alkmaar RP | Stinna
・Eigen staffzaak/gang gerelateerde zaken: Demote of ontslag
・Te weinig reports behandelen (gemiddeld 50 per week): Staffwarn of demote
・Jezelf/vrienden reviven of healen: Demote of ontslag
・Auto repairen: Staffwarn of ontslag
・Met names spelen: Demote of ontslag
・Teleporteren in jouw voordeel: Staffwarn of ontslag
・TXboost: Demote of staffwarn
・Voor jezelf of vrienden auto's of motors inspawnen: Demote of ontslag
・Godmode/superjump: Demote of ontslag
・Niet met artikels bannen, warnen of taken geven: Staffwarn
・Je banned met artikels en geldige redenen, dit geldt ook voor de taken (max 100): Staffwarn of demote
・Jezelf onprofessioneel opstellen zowel in als uit staffdienst: Staffwarn of demote
・Je niet aan de APV houden zowel in als uit dienst: Staffwarn of demote
・Je status niet uitzetten wanneer je een andere stad speelt = Ontslag
・Midden in een scenario handelen: staffwarn (Als je iemand wilt straffen laat je diegene eerst zijn of haar scenario afmaken.)
・De roleplay verstoren, bv midden op de weg rondlopen/staan, schieten bij burgers en rondrijden/vliegen in voertuigen bij burgers: staffwarn

**Regels taken**
・Als je iemand op taken stuurt dien je ook een notitie te maken. Dit kan met '/tx id notitie': Staffwarn of demote
・Als de persoon nog geen notities heeft altijd eerst een warn geven!
・Je moet 2 keer iemand op taken hebben gestuurd. 1e keer 50 taken en noteer dit via /tx id notitie. 2e keer 100 taken en noteer dit via /tx id notitie.
・3e keer een ban volgens de apv, maar wel weer notities weghalen (als je hem hebt gebant).`
                        )
                        .setColor("Blue");

                    await interaction.reply({ embeds: [embed, infoEmbed, regelsEmbed] });
                }
                else if (subCommand === "afgewezen") {
                    const reason = interaction.options.getString("reden");
                    const embed = new EmbedBuilder()
                        .setTitle("❌ Sollicitatie Afgewezen")
                        .setDescription(`Beste Sollicitant, \n\nBedankt voor uw sollicitatie voor het staffteam van Alkmaar Roleplay, maar helaas bent u afgewezen door een staffcoördinator met de reden: ${reason}. \nIndien u vragen heeft kan u dat gerust laten weten in de ticket.\n\nMet vriendelijke groet,\n\n> ${interaction.member.displayName}\n> Alkmaar Roleplay`)
                        .setColor("DarkGreen")
                    await interaction.reply({ embeds: [embed] });
                }
            }


            const LOG_CHANNEL_ID = "1366807865192353883";

            if (commandName === "panel") {
                const channel = interaction.options.getChannel("kanaal");
                if (!channel || channel.type !== ChannelType.GuildText) {
                    return interaction.reply({
                        content: "⚠️ Je moet een geldig tekstkanaal opgeven.",
                        ephemeral: true
                    });
                }

                const embed = new EmbedBuilder()
                    .setTitle("🎫 Ticket Systeem")
                    .setDescription(`Beste spelers van Alkmaar Roleplay! Je bent op de juiste plek gekomen om een vraag te stellen aan ons team! \nKlik op de knop onder dit bericht om een ticket te openen! \n\nKies de beste categorie die bij jouw vraag past, staat deze categorie er niet bij kunnen we deze wellicht later toevoegen.\n\nKies voor nu voor de meest passende categorie!`)
                    .setColor("DarkGreen")
                    .setFooter({ text: '© Alkmaar RP - Copyright 2025 - All Rights Reserved' });

                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId("ticket_select")
                    .setPlaceholder("📂 Kies een categorie...")
                    .addOptions([
                        { label: "Algemene Vragen", value: "algemene_vraag", emoji: "🎟️" },
                        { label: "Unban Aanvraag", value: "unban", emoji: "🎟️" },
                        { label: "Ingame Refunds", value: "ingame_refund", emoji: "🎟️" },
                        { label: "Development", value: "development", emoji: "🎟️" },
                        { label: "Klachten (Spelers)", value: "speler_klacht", emoji: "🎟️" },
                        { label: "Klachten (Staff)", value: "staff_klacht", emoji: "🎟️" },
                        { label: "Donatie", value: "donatie", emoji: "🎟️" },
                        { label: "Staff Sollicitatie", value: "sollicitatie", emoji: "🎟️"},
                        { label: "Gang Aanvraag", value: "gang_aanvraag", emoji: "🎟️" },
                    ]);

                const row = new ActionRowBuilder().addComponents(selectMenu);
                await channel.send({ embeds: [embed], components: [row] });

                // ✅ Logging
                const logChannel = interaction.guild.channels.cache.get(LOG_CHANNEL_ID);
                if (logChannel) {
                    const logEmbed = new EmbedBuilder()
                        .setTitle("📋 Ticketpaneel geplaatst")
                        .setDescription(`**Gebruiker:** ${interaction.user.tag} (${interaction.user.id})\n**Kanaal:** ${channel} (${channel.id})`)
                        .setColor("DarkRed")
                        .setTimestamp();
                    logChannel.send({ embeds: [logEmbed] });
                }

                return interaction.reply({ content: `✅ Ticketpaneel geplaatst in ${channel}`, ephemeral: true });
            }

            if (commandName === "toevoegen") {
                const user = interaction.options.getUser("user");
                const channel = interaction.channel;

                if (channel.type !== ChannelType.GuildText) {
                    return interaction.reply({ content: "❌ Dit commando werkt alleen in tekstkanalen.", ephemeral: true });
                }

                await channel.permissionOverwrites.create(user.id, {
                    ViewChannel: true,
                    SendMessages: true
                });

                return channel.send({
                    content: `<@${user.id}>`,
                    embeds: [new EmbedBuilder()
                        .setTitle("✅ Toegevoegd")
                        .setDescription(`${user.tag} is toegevoegd aan deze ticket.`)
                        .setColor("Green")]
                });
            }
            
            if (commandName === "verwijderen") {
                const user = interaction.options.getUser("user");
                const channel = interaction.channel;

                if (channel.type !== ChannelType.GuildText) {
                    return interaction.reply({ content: "❌ Dit commando werkt alleen in tekstkanalen.", ephemeral: true });
                }

                await channel.permissionOverwrites.create(user.id, {
                    ViewChannel: false,
                    SendMessages: false
                });

                return channel.send({
                    content: `<@${user.id}>`,
                    embeds: [new EmbedBuilder()
                        .setTitle("🗑️ Verwijderd")
                        .setDescription(`${user.tag} is verwijderd uit deze ticket.`)
                        .setColor("Red")]
                });
            }     
            
            if (commandName === "alert") {
                const channel = interaction.channel;
                const user = interaction.options.getUser("user"); // Haalt de gebruiker op uit de slash command optie

                // Tijd 24 uur vanaf nu
                const closeTime = Math.floor(Date.now() / 1000) + (24 * 60 * 60); // UNIX timestamp in seconden

                const embed = new EmbedBuilder()
                    .setTitle("⏰ Ticket Reminder")
                    .setDescription(`Als er binnen 24 uur geen reactie komt, wordt dit ticket automatisch gesloten.
                    
            **Automatisch sluiten:** <t:${closeTime}:R>

            Je kunt het ticket ook handmatig sluiten met de knop hieronder.`)
                    .setColor("Yellow");

                const closeButton = new ButtonBuilder()
                    .setCustomId("close_ticket")
                    .setLabel("Ticket sluiten")
                    .setStyle(ButtonStyle.Danger);

                const row = new ActionRowBuilder().addComponents(closeButton);

                await interaction.reply({
                    content: `<@${user.id}>`, // Gebruiker taggen
                    embeds: [embed],
                    components: [row]
                });

                const filter = (message) => !message.author.bot;
                const collector = channel.createMessageCollector({ filter, time: 24 * 60 * 60 * 1000 }); // 24 uur

                collector.on('collect', () => {
                    collector.stop('reactie ontvangen');
                    console.log(`Reactie ontvangen in ticket ${channel.name}. Ticket blijft open.`);
                });

                collector.on('end', async (collected, reason) => {
                    if (reason !== 'reactie ontvangen') {
                        await channel.send("❌ Geen reactie binnen 24 uur. Ticket wordt automatisch gesloten.");
                        await channel.delete().catch(console.error);
                    }
                });
            }


            

            if (commandName === "rename") {
                const newName = interaction.options.getString("new_name");
                const channel = interaction.channel;


                try {
                    // Als de naam niet verandert, stop de bewerking en stuur geen log
                    if (channel.name === newName) {
                        return interaction.editReply({
                            content: "❌ De nieuwe naam is hetzelfde als de huidige naam.",
                            ephemeral: true,
                        });
                    }

                    await interaction.deferReply({ ephemeral: true });

                    const oldName = channel.name; // Oude naam opslaan voor logging
                    await channel.setName(newName);

                    // Embed naar ticketkanaal
                    const embed = new EmbedBuilder()
                        .setTitle("✏️ Ticket hernoemd")
                        .setDescription(`Het ticketkanaal is succesvol hernoemd naar **${newName}**.`)
                        .setColor("DarkGreen")
                        .setTimestamp()
                        .setFooter({ text: `Door: ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() });

                    await interaction.editReply({ embeds: [embed] });

                    // Log embed naar logkanaal
                    const logChannel = await interaction.guild.channels.fetch(LOG_RENAME_CHANNEL_ID); // Gebruik nieuwe constante
                    if (logChannel && logChannel.isTextBased()) {
                        const logEmbed = new EmbedBuilder()
                            .setTitle("📄 Ticket Hernoemd")
                            .addFields(
                                { name: "Nieuw kanaal", value: `${oldName} ➔ ${newName}`, inline: false },
                                { name: "Door", value: `${interaction.user.tag} (${interaction.user.id})`, inline: false },
                            )
                            .setColor("DarkGreen")
                            .setTimestamp();

                        await logChannel.send({ embeds: [logEmbed] });
                    }

                } catch (err) {
                    console.error(`[RENAME] Fout bij hernoemen:`, err);

                    return interaction.editReply({
                        content: "❌ Er is iets misgegaan bij het hernoemen van het ticket.",
                        ephemeral: true,
                    });
                }
            }
            
            // Move command
            const categoryLabels = {
                "algemene_vraag": "Algemene Vragen Tickets",
                "unban": "Unban",
                "ingame_refund": "Ingame Refund",
                "speler_klacht": "Speler Klacht",
                "staff_klacht": "Staff Klacht",
                "donatie": "Donatie",
                "sollicitatie": "Staff Sollicitatie",
                "development": "Development",
                "overheid_coordinator": "Overheid Coördinator",
                "onderwereld_coordinator": "Onderwereld Coördinator",
                "gang_aanvraag": "Gang Aanvraag",
                "staff_coordinator": "Staff Coördinator",
            };

            if (commandName === "move") {
                const category = interaction.options.getString("category");
                const channel = interaction.channel;

                if (channel.type !== ChannelType.GuildText) {
                    return interaction.reply({ content: "❌ Dit commando werkt alleen in tekstkanalen.", ephemeral: true });
                }

                // Controleer of het een geldig ticketkanaal is door de topic te checken
                if (!channel.topic || !channel.topic.startsWith("Ticket van")) {
                    return interaction.reply({ content: "❌ Dit is geen geldig ticketkanaal.", ephemeral: true });
                }

                const categoryId = {
                    "algemene_vraag": "1367613102320783470",
                    "unban": "1367613137087496394",
                    "ingame_refund": "1367613186206994442",
                    "speler_klacht": "1367613217504755763",
                    "staff_klacht": "1367613217504755763",
                    "donatie": "1367126128849850549",
                    "sollicitatie": "1371864148610252830",
                    "development": "1372131570751766599",
                    "overheid_coordinator": "1382414156678041640",
                    "onderwereld_coordinator": "1382414087169904711",
                    "gang_aanvraag": "1382414087169904711",
                    "staff_coordinator": "1444736393325580371",
                }[category];

                if (!categoryId) {
                    return interaction.reply({ content: "❌ Ongeldige categorie opgegeven.", ephemeral: true });
                }

                const oldCategory = channel.parent?.name || "Onbekend";
                const supportRoleId = '1366807591472070860';
                const StaffCoRoleID = '1366808680598737018';
                const DevelopmentTeamRoleID = '1466119488784044247';

                // Haal de maker van het ticket op uit de topic
                const creatorId = channel.topic.split(" | Creator: ")[1];
                let member;
                try {
                    member = await interaction.guild.members.fetch(creatorId);
                } catch (error) {
                    return interaction.reply({ content: `❌ Kan de maker van dit kanaal niet vinden.`, ephemeral: true });
                }

                try {
                    // Verplaats naar nieuwe categorie
                    await channel.setParent(categoryId);

                    if (category === "staff_coordinator") {
                        // Restrict permissions to only creator and Staff Coordinator
                        await channel.permissionOverwrites.set([
                            { id: interaction.guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
                            { id: creatorId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
                            { id: StaffCoRoleID, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
                            { id: interaction.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
                        ]);
                    } else if (category === "development") {
                        // Development team permissions
                        await channel.permissionOverwrites.set([
                            { id: interaction.guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
                            { id: creatorId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
                            { id: DevelopmentTeamRoleID, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
                            { id: interaction.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
                        ]);
                    } else {
                        // Bewaar bestaande permissies
                        const permissions = channel.permissionOverwrites.cache.map((permOverwrite) => ({
                            id: permOverwrite.id,
                            allow: permOverwrite.allow,
                            deny: permOverwrite.deny
                        }));

                        // Zet permissies voor support en maker terug
                        for (const perm of permissions) {
                            if (perm.id === creatorId || perm.id === supportRoleId) {
                                await channel.permissionOverwrites.create(perm.id, {
                                    allow: perm.allow,
                                    deny: perm.deny
                                });
                            }
                        }

                        await channel.permissionOverwrites.create(supportRoleId, {
                            ViewChannel: true,
                            SendMessages: true
                        });

                        await channel.permissionOverwrites.create(creatorId, {
                            ViewChannel: true,
                            SendMessages: true
                        });
                    }

                    // Embed bevestiging
                    const confirmationEmbed = new EmbedBuilder()
                        .setColor("DarkGreen")
                        .setTitle("✅ Ticket Verplaatst")
                        .setDescription(`Dit ticket is succesvol verplaatst naar de categorie **${categoryLabels[category]}**.`)
                        .setFooter({ text: "Verplaatst door " + interaction.user.username })
                        .setTimestamp();

                    await channel.send({ embeds: [confirmationEmbed] });

                    // Move Logs
                    const logChannel = interaction.client.channels.cache.get(LOG_CHANNEL_ID);
                    if (logChannel && logChannel.isTextBased()) {
                        const embed = new EmbedBuilder()
                            .setTitle("📂 Ticket Verplaatst")
                            .setColor("DarkGreen")
                            .addFields(
                                { name: "🎫 Ticket", value: `${channel}`, inline: false },
                                { name: "📁 Oude Categorie", value: oldCategory, inline: false },
                                { name: "📂 Nieuwe Categorie", value: categoryLabels[category] || category, inline: false },
                                { name: "👤 Door", value: `<@${interaction.user.id}>`, inline: false }
                            )
                            .setFooter({ text: `Verplaatst op` })
                            .setTimestamp();

                        await logChannel.send({ embeds: [embed] });
                    }
                } catch (error) {
                    console.error("[ERROR] Move command failed:", error);
                    return interaction.reply({
                        content: "❌ Er is iets misgegaan bij het verplaatsen van het ticket.",
                        ephemeral: true
                    });
                }
            }




            if (commandName === "sluiten") {
                const reason = interaction.options.getString("reason") || "Geen reden opgegeven.";
                const channel = interaction.channel;
                const logChannel = await interaction.guild.channels.fetch(LOG_CHANNEL_ID);

                // Controleer of het een geldig ticketkanaal is door de topic te checken
                if (!channel.topic || !channel.topic.startsWith("Ticket van")) {
                    return interaction.reply({ content: "❌ Dit is geen geldig ticketkanaal.", ephemeral: true });
                }

                // Haal de maker van het ticket op uit de topic
                const creatorId = channel.topic.split(" | Creator: ")[1];
                const categoryFromTopic = channel.topic.split(" (")[1].split(") |")[0];
                let ticketCreatorMember;
                try {
                    ticketCreatorMember = await interaction.guild.members.fetch(creatorId);
                } catch (error) {
                    ticketCreatorMember = null;
                }
                const ticketCreator = ticketCreatorMember ? ticketCreatorMember.user.username : "Onbekend";

                // Category Labels
                const categoryLabels = {
                    "algemene_vraag": "Algemene Vragen",
                    "unban": "Unban",
                    "ingame_refund": "Ingame Refund",
                    "speler_klacht": "Speler Klacht",
                    "staff_klacht": "Staff Klacht",
                    "donatie": "Donatie",
                    "sollicitatie": "Staff Sollicitatie",
                    "development": "Development",
                    "gang_aanvraag": "Gang Aanvraag"
                };

                // Genereer transcript
                const messages = await channel.messages.fetch({ limit: 100 });
                const sortedMessages = [...messages.values()].reverse();
                let html = `
                    <!DOCTYPE html>
                    <html lang="nl">
                    <head>
                        <meta charset="UTF-8">
                        <title>Transcript - ${channel.name}</title>
                        <style>
                            body {
                                font-family: 'Arial', sans-serif;
                                background-color: #36393f;
                                color: #dcddde;
                                padding: 20px;
                                margin: 0;
                                height: 100%;
                            }

                            h1 {
                                color: #7289da;
                                font-size: 1.8rem;
                                border-bottom: 2px solid #7289da;
                                padding-bottom: 10px;
                                margin-bottom: 20px;
                            }

                            .header {
                                background-color: #2f3136;
                                border-radius: 5px;
                                padding: 15px;
                                margin-bottom: 20px;
                                border-left: 4px solid #7289da;
                            }

                            .header h2 {
                                color: #7289da;
                                font-size: 1.4rem;
                                margin-bottom: 10px;
                            }

                            .header p {
                                margin: 5px 0;
                                font-size: 1rem;
                            }

                            .footer {
                                background-color: #2f3136;
                                border-radius: 5px;
                                padding: 15px;
                                margin-top: 20px;
                                border-left: 4px solid #ff6b6b;
                                text-align: center;
                            }

                            .footer p {
                                margin: 5px 0;
                                font-size: 0.9rem;
                                color: #b9bbbe;
                            }

                            .message {
                                background-color: #2f3136;
                                border-radius: 5px;
                                padding: 10px;
                                margin-bottom: 10px;
                                display: flex;
                                flex-direction: column;
                            }

                            .author {
                                font-weight: bold;
                                color: #ffffff;
                                font-size: 1.1rem;
                            }

                            .timestamp {
                                color: #72767d;
                                font-size: 0.85rem;
                                margin-left: 10px;
                            }

                            .content {
                                color: #dcddde;
                                margin-top: 8px;
                                word-wrap: break-word;
                            }

                            .bot-message .author {
                                color: #99aab5;
                            }

                            .bot-message .content {
                                color: #b9bbbe;
                            }

                            .user-message .author {
                                color: #00b0f4;
                            }

                            .user-message .content {
                                color: #ffffff;
                            }
            
                            .embed {
                                background-color: #2f3136;
                                border-left: 4px solid #7289da;
                                border-radius: 5px;
                                padding: 10px;
                                margin-top: 10px;
                                color: #dcddde;
                            }
            
                            .embed-title {
                                font-weight: bold;
                                color: #ffffff;
                                font-size: 1.1rem;
                            }
            
                            .embed-description {
                                margin: 8px 0;
                            }
            
                            .embed-field {
                                margin: 5px 0;
                            }
            
                            .embed-field-name {
                                font-weight: bold;
                                color: #7289da;
                            }
            
                            .embed-field-value {
                                color: #dcddde;
                            }
            
                            .embed-footer {
                                font-size: 0.8rem;
                                color: #72767d;
                                margin-top: 10px;
                            }
                        </style>
                    </head>
                    <body>
                        <h1>📄 Transcript van ${channel.name}</h1>
                        <div class="header">
                            <h2>Ticket Informatie</h2>
                            <p><strong>Ticket Naam:</strong> ${channel.name}</p>
                            <p><strong>Maker:</strong> ${ticketCreator}</p>
                            <p><strong>Categorie:</strong> ${categoryLabels[categoryFromTopic] || categoryFromTopic || "Onbekend"}</p>
                            <p><strong>Gesloten door:</strong> ${interaction.user.tag}</p>
                            <p><strong>Reden:</strong> ${reason}</p>
                        </div>
                `;

                for (const msg of sortedMessages) {
                    const timestamp = msg.createdAt.toLocaleString("nl-NL");
                    const isBot = msg.author.bot;

                    let embedHtml = '';
                    if (msg.embeds && msg.embeds.length > 0) {
                        for (const embed of msg.embeds) {
                            embedHtml += `<div class="embed">`;
                            if (embed.title) embedHtml += `<div class="embed-title">${embed.title}</div>`;
                            if (embed.description) embedHtml += `<div class="embed-description">${embed.description}</div>`;
                            if (embed.fields && embed.fields.length > 0) {
                                for (const field of embed.fields) {
                                    embedHtml += `<div class="embed-field"><div class="embed-field-name">${field.name}</div><div class="embed-field-value">${field.value}</div></div>`;
                                }
                            }
                            if (embed.footer && embed.footer.text) embedHtml += `<div class="embed-footer">${embed.footer.text}</div>`;
                            embedHtml += `</div>`;
                        }
                    }

                    html += `
                        <div class="message ${isBot ? 'bot-message' : 'user-message'}">
                            <div class="author">${msg.author.tag} <span class="timestamp">[${timestamp}]</span></div>
                            <div class="content">${msg.content || "<i>Geen inhoud</i>"}</div>
                            ${embedHtml}
                        </div>
                    `;
                }

                html += `
                        <div class="footer">
                            <p><strong>Ticket gesloten op:</strong> ${new Date().toLocaleString("nl-NL")}</p>
                            <p>Bedankt voor het gebruiken van onze support. Hopelijk tot snel op Alkmaar Roleplay!</p>
                        </div>
                    </body></html>`;

                const transcriptPath = `./transcripts/${channel.id}.html`;
                writeFileSync(transcriptPath, html);

                // Log het sluiten van het ticket naar het logkanaal
                await logChannel.send({
                    embeds: [new EmbedBuilder()
                        .setTitle("📁 Ticket Gesloten")
                        .addFields(
                            { name: "Ticket Naam", value: channel.name },
                            { name: "Ticket Maker", value: ticketCreator },
                            { name: "Categorie", value: categoryLabels[categoryFromTopic] || categoryFromTopic || "Onbekend" },
                            { name: "Reden", value: reason }
                        )
                        .setColor("DarkGreen")]
                });

                // Verstuur transcript naar logkanaal
                await logChannel.send({
                    files: [transcriptPath]
                });

                // Verstuur transcript naar de maker van het ticket (als mogelijk)
                if (ticketCreatorMember) {
                    try {
                        const embed = new EmbedBuilder()
                            .setColor('DarkGreen')
                            .setTitle('Ticket Transcript')
                            .setDescription(`Hey!\n  Uw ticket is zojuist gesloten in de ***Alkmaar Support*** server! Loop jij tegen nieuwe vragen aan? Dan kan je altijd opnieuw een ticket openen in onze support server!
\n Bekijk je transcript hieronder, bewaar deze goed om naar terug te refereren.
Hopelijk tot snel op ***Alkmaar Roleplay***!`)
                            .addFields(
                                { name: 'Ticket Naam', value: channel.name },
                                { name: 'Gesloten door', value: interaction.user.tag },
                                { name: 'Reden', value: reason || "Geen reden opgegeven." })
                            .setTimestamp()
                            .setFooter({ text: 'Alkmaar Roleplay' });

                        const row = new ActionRowBuilder()
                            .addComponents(
                                new ButtonBuilder()
                                    .setCustomId('review_1')
                                    .setLabel('⭐')
                                    .setStyle(ButtonStyle.Secondary),
                                new ButtonBuilder()
                                    .setCustomId('review_2')
                                    .setLabel('⭐⭐')
                                    .setStyle(ButtonStyle.Secondary),
                                new ButtonBuilder()
                                    .setCustomId('review_3')
                                    .setLabel('⭐⭐⭐')
                                    .setStyle(ButtonStyle.Secondary),
                                new ButtonBuilder()
                                    .setCustomId('review_4')
                                    .setLabel('⭐⭐⭐⭐')
                                    .setStyle(ButtonStyle.Secondary),
                                new ButtonBuilder()
                                    .setCustomId('review_5')
                                    .setLabel('⭐⭐⭐⭐⭐')
                                    .setStyle(ButtonStyle.Secondary),
                            );

                        await ticketCreatorMember.send({
                            embeds: [embed],
                            files: [transcriptPath],
                            components: [row]
                        });
                    } catch (err) {
                        console.warn(`⚠️ Kan geen DM sturen naar ${ticketCreatorMember.user.tag}. Fout: ${err.message}`);
                    }
                }

                // Verwijder het kanaal na het sluiten
                await channel.delete();
                return;
            }

        }

        if (interaction.isButton() && interaction.customId === "claim_ticket") {
            const channel = interaction.channel;

            if (!channel.topic || !channel.topic.startsWith("Ticket van")) {
                return interaction.reply({ content: "❌ Dit is geen ticketkanaal.", ephemeral: true });
            }

            const creatorId = channel.topic.split(" | Creator: ")[1].split(" |")[0];
            const category = channel.topic.split(" (")[1].split(") |")[0];

            if (!interaction.member.roles.cache.has('1366807591472070860')) {
                return interaction.reply({ content: "❌ Je hebt niet de juiste rol om tickets te claimen.", ephemeral: true });
            }

            if (channel.topic.includes("Claimed by:")) {
                return interaction.reply({ content: "Dit ticket is al geclaimed.", ephemeral: true });
            }

            const newTopic = `${channel.topic} | Claimed by: ${interaction.user.id}`;
            await channel.setTopic(newTopic);

            // Remove permissions for other roles/users except creator, claimer, bot, everyone
            const overwrites = channel.permissionOverwrites.cache;
            for (const [id, overwrite] of overwrites) {
                if (id !== interaction.guild.roles.everyone.id && id !== creatorId && id !== interaction.user.id && id !== interaction.client.user.id) {
                    await channel.permissionOverwrites.delete(id);
                }
            }

            // Set permissions
            await channel.permissionOverwrites.edit(interaction.guild.roles.everyone.id, { ViewChannel: false, SendMessages: false });
            await channel.permissionOverwrites.edit(creatorId, { ViewChannel: true, SendMessages: true });
            await channel.permissionOverwrites.edit(interaction.user.id, { ViewChannel: true, SendMessages: true });
            await channel.permissionOverwrites.edit(interaction.client.user.id, { ViewChannel: true, SendMessages: true });

            // Allow relevant staff to view but not send
            const StaffCoRoleID = '1366808680598737018';
            const bestuurRoleID = '1366844986674380820';
            const UnbanRoleID = '1367895035374469210';
            const RefundRoleID = '1366809121914880111';
            const supportRoleId = '1366807591472070860';
            const DevelopmentTeamRoleID = '1466119488784044247';

            if (category === "staff_klacht" || category === "sollicitatie") {
                await channel.permissionOverwrites.edit(StaffCoRoleID, { ViewChannel: true, SendMessages: false });
            }
            else if (category === "donatie") {
                await channel.permissionOverwrites.edit(bestuurRoleID, { ViewChannel: true, SendMessages: false });
            }
            else if (category === "unban") {
                await channel.permissionOverwrites.edit(UnbanRoleID, { ViewChannel: true, SendMessages: false });
            }
            else if (category === "ingame_refund") {
                await channel.permissionOverwrites.edit(RefundRoleID, { ViewChannel: true, SendMessages: false });
            }
            else if (category === "development") {
                await channel.permissionOverwrites.edit(DevelopmentTeamRoleID, { ViewChannel: true, SendMessages: false });
            }
            else if (category === "gang_aanvraag") {
                await channel.permissionOverwrites.edit("1366868957344174091", { ViewChannel: true, SendMessages: false });
            }
            else {
                await channel.permissionOverwrites.edit(supportRoleId, { ViewChannel: true, SendMessages: false });
            }

            await interaction.reply({ content: `Ticket geclaimed door ${interaction.user.tag}.`, ephemeral: true });

            // Send embed notification
            const claimEmbed = new EmbedBuilder()
                .setTitle("🎫 Ticket Geclaimed")
                .setDescription(`Dit ticket is succesvol geclaimed door <@${interaction.user.id}>.`)
                .setColor("Green")
                .setTimestamp();
            await channel.send({ embeds: [claimEmbed] });

            // Update button to unclaim
            const messages = await channel.messages.fetch({ limit: 50 });
            const ticketMessage = messages.find(msg => msg.embeds.some(embed => embed.title === "🎫 Nieuw Ticket"));
            if (ticketMessage) {
                const closeButton = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId("close_ticket")
                        .setLabel("❌ Ticket sluiten")
                        .setStyle(ButtonStyle.Danger)
                );
                const unclaimButton = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId("unclaim_ticket")
                        .setLabel("Unclaim Ticket")
                        .setStyle(ButtonStyle.Secondary)
                );
                await ticketMessage.edit({ components: [closeButton, unclaimButton] });
            }
        }

        if (interaction.isButton() && interaction.customId === "unclaim_ticket") {
            const channel = interaction.channel;

            if (!channel.topic || !channel.topic.startsWith("Ticket van")) {
                return interaction.reply({ content: "❌ Dit is geen ticketkanaal.", ephemeral: true });
            }

            if (!channel.topic.includes(`Claimed by: ${interaction.user.id}`)) {
                return interaction.reply({ content: "❌ U kunt alleen uw eigen geclaimde tickets unclaimen.", ephemeral: true });
            }

            const creatorId = channel.topic.split(" | Creator: ")[1].split(" |")[0];
            const category = channel.topic.split(" (")[1].split(") |")[0];

            // Restore topic
            const newTopic = channel.topic.replace(/ \| Claimed by: \d+/, '');
            await channel.setTopic(newTopic);

            // Restore permissions based on category
            const supportRoleId = '1366807591472070860';
            const StaffCoRoleID = '1366808680598737018';
            const bestuurRoleID = '1366844986674380820';
            const UnbanRoleID = '1367895035374469210';
            const RefundRoleID = '1366809121914880111';
            const DevelopmentTeamRoleID = '1466119488784044247';

            let permissionOverwrites = [
                { id: interaction.guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
                { id: creatorId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
                { id: interaction.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
            ];

            if (category === "staff_klacht") {
                permissionOverwrites.push({
                    id: StaffCoRoleID,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
                });
            }
            else if (category === "sollicitatie") {
                permissionOverwrites.push({
                    id: StaffCoRoleID,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
                });
            }
            else if (category === "donatie") {
                permissionOverwrites.push({
                    id: bestuurRoleID,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
                });
            }
            else if (category === "unban") {
                permissionOverwrites.push({
                    id: UnbanRoleID,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
                });
            }
            else if (category === "ingame_refund") {
                permissionOverwrites.push({
                    id: RefundRoleID,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
                });
            }
            else if (category === "development") {
                permissionOverwrites.push({
                    id: DevelopmentTeamRoleID,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
                });
            }
            else if (category === "gang_aanvraag") {
                permissionOverwrites.push({
                    id: "1366868957344174091",
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
                });
            }
            else {
                permissionOverwrites.push({
                    id: supportRoleId,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
                });
            }

            await channel.permissionOverwrites.set(permissionOverwrites);

            await interaction.reply({ content: `Ticket unclaimed door ${interaction.user.tag}.`, ephemeral: true });

            // Send embed notification
            const unclaimEmbed = new EmbedBuilder()
                .setTitle("🎫 Ticket Unclaimed")
                .setDescription(`Dit ticket is unclaimed door <@${interaction.user.id}>.`)
                .setColor("DarkGreen")
                .setTimestamp();
            await channel.send({ embeds: [unclaimEmbed] });

            // Update button back to claim
            const messages = await channel.messages.fetch({ limit: 50 });
            const ticketMessage = messages.find(msg => msg.embeds.some(embed => embed.title === "🎫 Nieuw Ticket"));
            if (ticketMessage) {
                const closeButton = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId("close_ticket")
                        .setLabel("❌ Ticket sluiten")
                        .setStyle(ButtonStyle.Danger)
                );
                const claimButton = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId("claim_ticket")
                        .setLabel("Claim Ticket")
                        .setStyle(ButtonStyle.Primary)
                );
                await ticketMessage.edit({ components: [closeButton, claimButton] });
            }
        }

        if (interaction.isStringSelectMenu() && interaction.customId === "ticket_select") {
            const category = interaction.values[0];

            const modal = new ModalBuilder()
                .setCustomId(`ticket_${category}`)
                .setTitle(`Ticket: ${category.replaceAll("_", " ")}`);

            const input = new TextInputBuilder()
                .setCustomId("details")
                .setLabel("Waarmee kunnen wij u helpen?")
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true);

            const row = new ActionRowBuilder().addComponents(input);
            modal.addComponents(row);

            await interaction.showModal(modal);
        }


        if (interaction.isModalSubmit()) {
            const category = interaction.customId.replace("ticket_", "");
            const details = interaction.fields.getTextInputValue("details");

            // Ticketcategorieën
            const categoryId = {
                "algemene_vraag": "1367613102320783470",
                "unban": "1367613137087496394",
                "ingame_refund": "1367613186206994442",
                "speler_klacht": "1367613217504755763",
                "staff_klacht": "1367613217504755763",
                "donatie": "1367126128849850549",
                "sollicitatie": "1371864148610252830",
                "development": "1372131570751766599",
                "gang_aanvraag": "1382414087169904711",
            }[category];

            if (!categoryId) {
                return interaction.reply({
                    content: "❌ Er ging iets mis met het aanmaken van uw ticket. Onbekende categorie.",
                    ephemeral: true,
                });
            }

            const supportRoleId = '1366807591472070860';
            const StaffCoRoleID = '1366808680598737018';
            const bestuurRoleID = '1366844986674380820';
            const UnbanRoleID = '1367895035374469210';
            const RefundRoleID = '1366809121914880111';
            const DevelopmentTeamRoleID = '1466119488784044247';

            // Bepaal permissies per categorie
            let permissionOverwrites = [
                { id: interaction.guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
                { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
                { id: interaction.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
            ];

            if (category === "staff_klacht") {
                permissionOverwrites.push({
                    id: StaffCoRoleID,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
                });
            }
            else if (category === "sollicitatie") {
                permissionOverwrites.push({
                    id: StaffCoRoleID,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
                });
            }
            else if (category === "donatie") {
                permissionOverwrites.push({
                    id: bestuurRoleID,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
                });
            }
            else if (category === "unban") {
                permissionOverwrites.push({
                    id: UnbanRoleID,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
                });
            }
            else if (category === "ingame_refund") {
                permissionOverwrites.push({
                    id: RefundRoleID,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
                });
            }
            else if (category === "development") {
                permissionOverwrites.push({
                    id: DevelopmentTeamRoleID,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
                });
            }
            else if (category === "gang_aanvraag") {
                permissionOverwrites.push({
                    id: "1366868957344174091",
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
                });
            }
            else {
                permissionOverwrites.push({
                    id: supportRoleId,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
                });
            }

            const channel = await interaction.guild.channels.create({
                name: `${category}-${interaction.user.username}`.toLowerCase().replace(/[^a-z0-9\-]/g, ""),
                type: ChannelType.GuildText,
                parent: categoryId,
                topic: `Ticket van ${interaction.user.tag} (${category}) | Creator: ${interaction.user.id}`,
                permissionOverwrites: permissionOverwrites,
            });

            // Knop: Sluit ticket
            const closeButton = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId("close_ticket")
                    .setLabel("❌ Ticket sluiten")
                    .setStyle(ButtonStyle.Danger)
            );

            // Knop: Claim ticket
            const claimButton = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId("claim_ticket")
                    .setLabel("Claim Ticket")
                    .setStyle(ButtonStyle.Primary)
            );

            // Category Namen
            const categoryLabels = {
                "algemene_vraag": "Algemene Vragen",
                "unban": "Unban",
                "ingame_refund": "Ingame Refund",
                "speler_klacht": "Speler Klacht",
                "staff_klacht": "Staff Klacht",
                "donatie": "Donatie",
                "sollicitatie": "Staff Sollicitatie",
                "development": "Development",
                "gang_aanvraag": "Gang Aanvraag"
            };

            // Bepaal role mention per categorie
            let roleMention = '';
            if (["staff_klacht", "sollicitatie"].includes(category)) {
                roleMention = `<@&${StaffCoRoleID}>`;
            } else if (category === "donatie") {
                roleMention = `<@&${bestuurRoleID}>`;
            } else if (category === "unban") {
                roleMention = `<@&${UnbanRoleID}>`;
            } else if (category === "ingame_refund") {
                roleMention = `<@&${RefundRoleID}>`;
            } else if (category === "development") {
                roleMention = `<@&${DevelopmentTeamRoleID}>`;
            } else if (category === "gang_aanvraag") {
                roleMention = `<@&1366868957344174091>`;
            } else {
                roleMention = `<@&${supportRoleId}>`;
            }

            // Verstuur embed + knop
            await channel.send({
                content: `<@${interaction.user.id}> ${roleMention}`,
                embeds: [
                    {
                        title: "🎫 Nieuw Ticket",
                        color: 'DarkGreen',
                        fields: [
                            { name: "Aangemaakt door", value: `<@${interaction.user.id}>`, inline: true },
                            { name: "Categorie", value: categoryLabels[category] || category, inline: true },
                            { name: "Details", value: details || "Geen details opgegeven." },

                        ],
                        timestamp: new Date().toISOString(),
                        footer: {
                            text: `User ID: ${interaction.user.id}`
                        }
                    }
                ],
                components: [closeButton, claimButton]
            });

            // Post template for gang_aanvraag
            if (category === "gang_aanvraag") {
                const templateMessage = `Beste ${interaction.user.toString()},\n\nBedankt voor uw interesse in het starten van een gang, Om een aanvraag te doen, verzoeken wij u vriendelijk de onderstaande informatie in te vullen:\n\n**Naam Boss:**\n**Leeftijd Boss:**\n**Gangnaam:**\n**Opmerkingen:**\n**Aantal leden:**\n\nMet vriendelijke groet,\n\n> Team Alkmaar RP`;
                await channel.send({ content: templateMessage });
            }

            await interaction.reply({
                content: `✅ Uw ticket is aangemaakt in <#${channel.id}>.`,
                ephemeral: true
            });
        }



        if (interaction.isButton() && interaction.customId === "close_ticket") {
            const supportRoleId = '1366807591472070860';
            if (!interaction.member.roles.cache.has(supportRoleId)) {
        return interaction.reply({
            content: "❌ U hebt geen toestemming om dit ticket te sluiten.",
            ephemeral: true
        });
    }

    const channel = interaction.channel;

    // Controleer of het een geldig ticketkanaal is door de topic te checken
    if (!channel.topic || !channel.topic.startsWith("Ticket van")) {
        return interaction.reply({ content: "❌ Dit is geen geldig ticketkanaal.", ephemeral: true });
    }
    const logChannel = await interaction.guild.channels.fetch(LOG_CHANNEL_ID);
    const creatorId = channel.topic.split(" | Creator: ")[1];
    const categoryFromTopic = channel.topic.split(" (")[1].split(") |")[0];
    let ticketCreator;
    try {
        ticketCreator = await interaction.guild.members.fetch(creatorId);
    } catch (error) {
        ticketCreator = null;
    }
    const creatorUsername = ticketCreator ? ticketCreator.user.username : "Onbekend";

    // Category Labels
    const categoryLabels = {
        "algemene_vraag": "Algemene Vragen",
        "unban": "Unban",
        "ingame_refund": "Ingame Refund",
        "speler_klacht": "Speler Klacht",
        "staff_klacht": "Staff Klacht",
        "donatie": "Donatie",
        "sollicitatie": "Staff Sollicitatie",
        "development": "Development",
        "gang_aanvraag": "Gang Aanvraag"
    };

    const messages = await channel.messages.fetch({ limit: 100 });
    const sortedMessages = [...messages.values()].reverse();

    let html = `
        <!DOCTYPE html>
        <html lang="nl">
        <head>
            <meta charset="UTF-8">
            <title>Transcript - ${channel.name}</title>
            <style>
                body {
                    font-family: 'Arial', sans-serif;
                    background-color: #36393f;
                    color: #dcddde;
                    padding: 20px;
                    margin: 0;
                    height: 100%;
                }

                h1 {
                    color: #7289da;
                    font-size: 1.8rem;
                    border-bottom: 2px solid #7289da;
                    padding-bottom: 10px;
                    margin-bottom: 20px;
                }

                .header {
                    background-color: #2f3136;
                    border-radius: 5px;
                    padding: 15px;
                    margin-bottom: 20px;
                    border-left: 4px solid #7289da;
                }

                .header h2 {
                    color: #7289da;
                    font-size: 1.4rem;
                    margin-bottom: 10px;
                }

                .header p {
                    margin: 5px 0;
                    font-size: 1rem;
                }

                .footer {
                    background-color: #2f3136;
                    border-radius: 5px;
                    padding: 15px;
                    margin-top: 20px;
                    border-left: 4px solid #ff6b6b;
                    text-align: center;
                }

                .footer p {
                    margin: 5px 0;
                    font-size: 0.9rem;
                    color: #b9bbbe;
                }

                .message {
                    background-color: #2f3136;
                    border-radius: 5px;
                    padding: 10px;
                    margin-bottom: 10px;
                    display: flex;
                    flex-direction: column;
                }

                .author {
                    font-weight: bold;
                    color: #ffffff;
                    font-size: 1.1rem;
                }

                .timestamp {
                    color: #72767d;
                    font-size: 0.85rem;
                    margin-left: 10px;
                }

                .content {
                    color: #dcddde;
                    margin-top: 8px;
                    word-wrap: break-word;
                }

                .bot-message .author {
                    color: #99aab5;
                }

                .bot-message .content {
                    color: #b9bbbe;
                }

                .user-message .author {
                    color: #00b0f4;
                }

                .user-message .content {
                    color: #ffffff;
                }

                .embed {
                    background-color: #2f3136;
                    border-left: 4px solid #7289da;
                    border-radius: 5px;
                    padding: 10px;
                    margin-top: 10px;
                    color: #dcddde;
                }

                .embed-title {
                    font-weight: bold;
                    color: #ffffff;
                    font-size: 1.1rem;
                }

                .embed-description {
                    margin: 8px 0;
                }

                .embed-field {
                    margin: 5px 0;
                }

                .embed-field-name {
                    font-weight: bold;
                    color: #7289da;
                }

                .embed-field-value {
                    color: #dcddde;
                }

                .embed-footer {
                    font-size: 0.8rem;
                    color: #72767d;
                    margin-top: 10px;
                }
            </style>
        </head>
        <body>
            <h1>📄 Transcript van ${channel.name}</h1>
            <div class="header">
                <h2>Ticket Informatie</h2>
                <p><strong>Ticket Naam:</strong> ${channel.name}</p>
                <p><strong>Maker:</strong> ${creatorUsername}</p>
                <p><strong>Categorie:</strong> ${categoryLabels[categoryFromTopic] || categoryFromTopic || "Onbekend"}</p>
                <p><strong>Gesloten door:</strong> ${interaction.user.tag}</p>
                <p><strong>Reden:</strong> Geen reden opgegeven.</p>
            </div>
    `;

    for (const msg of sortedMessages) {
        const timestamp = msg.createdAt.toLocaleString("nl-NL");
        const isBot = msg.author.bot;

        let embedHtml = '';
        if (msg.embeds && msg.embeds.length > 0) {
            for (const embed of msg.embeds) {
                embedHtml += `<div class="embed">`;
                if (embed.title) embedHtml += `<div class="embed-title">${embed.title}</div>`;
                if (embed.description) embedHtml += `<div class="embed-description">${embed.description}</div>`;
                if (embed.fields && embed.fields.length > 0) {
                    for (const field of embed.fields) {
                        embedHtml += `<div class="embed-field"><div class="embed-field-name">${field.name}</div><div class="embed-field-value">${field.value}</div></div>`;
                    }
                }
                if (embed.footer && embed.footer.text) embedHtml += `<div class="embed-footer">${embed.footer.text}</div>`;
                embedHtml += `</div>`;
            }
        }

        html += `
            <div class="message ${isBot ? 'bot-message' : 'user-message'}">
                <div class="author">${msg.author.tag} <span class="timestamp">[${timestamp}]</span></div>
                <div class="content">${msg.content || "<i>Geen inhoud</i>"}</div>
                ${embedHtml}
            </div>
        `;
    }

    html += `
            <div class="footer">
                <p><strong>Ticket gesloten op:</strong> ${new Date().toLocaleString("nl-NL")}</p>
                <p>Bedankt voor het gebruiken van onze support. Hopelijk tot snel op Cloud Roleplay!</p>
            </div>
        </body></html>`;

    const transcriptPath = `./transcripts/${channel.id}.html`;
    writeFileSync(transcriptPath, html);

    const embed = new EmbedBuilder()
        .setTitle("📁 Ticket Gesloten")
        .setDescription(`Gesloten door ${interaction.user.tag}`)
        .addFields(
            { name: "Ticket Kanaal", value: channel.name },
            { name: "Maker", value: creatorUsername },
            { name: "Categorie", value: categoryLabels[categoryFromTopic] || categoryFromTopic || "Onbekend" },
        )
        .setColor("DarkGreen");

    await logChannel.send({
        embeds: [embed],
        files: [transcriptPath]
    });

    if (ticketCreator) {
        try {
            const embed = new EmbedBuilder()
                .setColor('DarkGreen')
                .setTitle('Loop jij tegen nieuwe vragen/problemen aan?')
                .setDescription(`Hey!\n  Uw ticket is zojuist gesloten in de ***Alkmaar Support*** server! Loop jij tegen nieuwe vragen aan? Dan kan je altijd opnieuw een ticket openen in onze support server!
\n Bekijk je transcript hieronder, bewaar deze goed om naar terug te refereren.
Hopelijk tot snel op ***Alkmaar Roleplay***!`)
                .addFields(
                    { name: 'Ticket Naam', value: channel.name },
                    { name: 'Gesloten door', value: interaction.user.tag },
                    { name: 'Reden', value: "Geen reden opgegeven." })
                .setTimestamp()
                .setFooter({ text: 'Alkmaar Roleplay' });

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('review_1')
                        .setLabel('⭐')
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId('review_2')
                        .setLabel('⭐⭐')
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId('review_3')
                        .setLabel('⭐⭐⭐')
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId('review_4')
                        .setLabel('⭐⭐⭐⭐')
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId('review_5')
                        .setLabel('⭐⭐⭐⭐⭐')
                        .setStyle(ButtonStyle.Secondary),
                );

            await ticketCreator.send({
                embeds: [embed],
                files: [transcriptPath],
                components: [row]
            });
        } catch (err) {
            console.warn(`⚠️ Kan geen DM sturen naar ${ticketCreator.user.tag}. Fout: ${err.message}`);
        }
    }

    if (existsSync(transcriptPath)) {
        unlinkSync(transcriptPath); // Verwijder bestand
    }

    await channel.delete();
}

    } catch (error) {
        console.error("Fout tijdens interaction:", error);
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: 'Er ging iets mis tijdens het verwerken van de interactie.', ephemeral: true });
        } else {
            await interaction.reply({ content: 'Er ging iets mis tijdens het verwerken van de interactie.', ephemeral: true });
        }
    }
});

client.login(process.env.TOKEN);
