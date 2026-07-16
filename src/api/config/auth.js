import { google } from 'googleapis';

/*
*Private Search
*/
export const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_CALLBACK_URL
);

export const scopes = ['https://www.googleapis.com/auth/youtube.readonly'];

export const authorizationUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    include_granted_scopes: true,
    prompt: 'consent'
});

/*
*Public Search
*/ 
export const youtube = google.youtube({
    version: "v3",
    auth: process.env.YT_API_KEY,
    headers: {'Referer': process.env.FRONTEND_URL}
});