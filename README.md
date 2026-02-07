# Song-List-Downloader

A Node.js backend utility designed to automate the search, filtering, and high-quality conversion of YouTube content into local MP3 files. It utilizes a queued processing system to handle multiple requests without overwhelming system resources. And it is completely legal for personal use.

## Technical Overview

- **Automated Search & Filter**: Uses the YouTube Data API v3 to find the most relevant video for a query. It includes a duration filter (default <= 7 mins) to prioritize songs and avoid full albums or hour-long mixes.
    
- **Asynchronous Download Queue**: Implements a serialized queue logic to process downloads one-by-one, ensuring system stability and avoiding IP flagging.
    
- **Vectorized CLI Wrapper**: Features a custom JavaScript wrapper that translates JSON options into `yt-dlp` command-line arguments, invoking the process via the Python launcher.
    
- **Stability Detection**: Includes a file-system polling mechanism that verifies a download is complete by checking for file size stability before resolving the task.
    

## Prerequisites (Critical)

1. **YouTube API Key**: You **must** obtain a YouTube Data API v3 Key from the [Google Cloud Console](https://console.cloud.google.com/). Without this key, the search functionality will not work.
    
2. **Libraries**: Must be installed and accessible these libraries: 
    - axios: 1.12.2
    - cors: 2.8.5
    - dotenv: 17.2.3
    - express: 5.1.0
    - googleapis: 161.0.0
    - yt-dlp-exec: 1.0.2
    
3. **FFmpeg**: Required for audio extraction. Ensure `ffmpeg` is in your system PATH.
    

## Implementation Details

### API Architecture

The server is built with Express and exposes a single `/batch-download` POST endpoint. It accepts an array of strings, maps them to internal `Promise` objects, and pushes them into a global processing queue.

### File Handling

Downloads are saved to a dedicated `yt-batch-downloader` folder within the user's home `Downloads` directory. Files are served statically via the `/downloads` route once processing is finished.
