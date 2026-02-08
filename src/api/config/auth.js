import { google } from 'googleapis';
import dotenv from 'dotenv';
dotenv.config();

/*
*Private Search
*/
export const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    'http://localhost:3000/auth/callback'
);

export const scopes = ['https://www.googleapis.com/auth/youtube.readonly'];

export const authorizationUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    include_granted_scopes: true,
    prompt: 'consent' // Forces the refresh token to be sent
});


/*
*Public Search
*/ 
export const youtube = google.youtube({
    version: "v3",
    auth: process.env.YT_API_KEY,
});