import 'dotenv/config';
import data from './data.json' with { type: 'json' };
import { writeFile } from 'fs/promises';
import fs from 'fs';

const logStream = fs.createWriteStream('log.txt', { flags: 'a' });
console.log = (...args) => {
    logStream.write(new Date().toISOString() + ' ' + args.join(' ') + '\n');
};

(async () => {
    try {
        console.log('---------------- Script starts ----------------');
        console.log(`Last run: ${data.lastRun}`);
        const lastRunDate = new Date(data.lastRun);
        const nowDate = new Date();
        const weekInMs = 7 * 24 * 60 * 60 * 1000;

        const oldTrainings = data.trainings;
        let newTrainings = [];

        if (nowDate - lastRunDate > weekInMs) {
            console.log("Run register");

            const puppeteer = await import('puppeteer');
            await register(newTrainings, oldTrainings, puppeteer);
            data.lastRun = nowDate.toISOString();
            data.trainings = newTrainings;

            await saveData('./data.json', data);
        }

        console.log('Script finished.');
    } catch (err) {
        console.error("Unexpected error:", err);
    }
})();

async function saveData(filePath, data) {
    try {
        const jsonString = JSON.stringify(data, null, 4);
        await writeFile(filePath, jsonString, 'utf-8');
        console.log('Data saved');
    } catch (err) {
        console.error('Error while saving: ' + err);
    }
}

async function register(newTrainings, oldTrainings, puppeteer) {
    console.log("Launch browser");
    const browser = await puppeteer.launch();
    console.log("New Page");
    const page = await browser.newPage();

    console.log("Goto signin");
    await page.goto('https://www.motibro.com/signin', { waitUntil: 'networkidle0' });

    // console.log("Type email, password");
    await page.type('#email', process.env.MOTIBRO_EMAIL);
    await page.type('#password', process.env.MOTIBRO_PASSWORD);

    console.log("Log in");
    await page.click('.btn.btn-lg');
    await page.waitForNavigation({ waitUntil: 'networkidle0' });

    await page.goto('https://www.motibro.com/users/my_bookings', { waitUntil: 'networkidle0' });

    const rows = await page.$$('#datatable_users_booking_body tr');
    for (const row of rows) {
        const tds = await row.$$('td');

        if (tds[3] === undefined) {
            continue;
        }

        const textHandle = await tds[3].getProperty('textContent');
        const text = await textHandle.jsonValue();
        // console.log(text.trim());

        if (text.trim() === "Felnőtt karate" || text.trim() === "Funkcionális edzés") {
            const link = await tds[5].$('div > a');

            if (!link) {
                continue;
            }

            const rowIdHandle = await row.getProperty('id');
            const rowId = await rowIdHandle.jsonValue();
            // console.log(rowId);
            newTrainings.push(rowId);
            if (oldTrainings.includes(rowId)) {
                continue;
            }

            const linkSpan = await link.$('span');
            const linkTextHandle = await linkSpan.getProperty('textContent');
            const linkText = await linkTextHandle.jsonValue();

            if (linkText.trim() === "Bejelentkezés") {
                console.log(`Sign up for training: ${rowId} - ${text.trim()}`);
                await link.click();
            }
        }
    }

    await browser.close();
};