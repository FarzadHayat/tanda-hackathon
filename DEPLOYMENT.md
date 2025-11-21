# Deployment Guide for "What am I Doing?"

This guide will walk you through deploying your volunteer scheduling app to production.

## Prerequisites

- A Supabase account and project (you already have this set up)
- A GitHub account (for deploying to Vercel)
- Git installed on your machine

## Step 1: Set Up Supabase Database

If you haven't already run the database schema:

1. Go to your Supabase project dashboard: https://supabase.com/dashboard
2. Navigate to the **SQL Editor**
3. Copy the entire contents of `supabase-schema.sql`
4. Paste it into the SQL Editor and click **Run**
5. Verify all tables were created under **Table Editor**

## Step 2: Configure Supabase Authentication

1. Go to **Authentication** → **Providers** in Supabase
2. Make sure **Email** provider is enabled
3. Under **Authentication** → **URL Configuration**, set:
   - **Site URL**: Your production domain (e.g., `https://your-app.vercel.app`)
   - **Redirect URLs**: Add your production domain

## Step 3: Initialize Git Repository (if not already done)

```bash
git init
git add .
git commit -m "Initial commit"
```

## Step 4: Push to GitHub

1. Create a new repository on GitHub
2. Push your code:

```bash
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git branch -M main
git push -u origin main
```

## Step 5: Deploy to Vercel

### Option A: Deploy via Vercel Dashboard (Recommended)

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub
2. Click **Add New** → **Project**
3. Import your GitHub repository
4. Configure the project:
   - **Framework Preset**: Next.js (should be auto-detected)
   - **Build Command**: `npm run build` (default)
   - **Output Directory**: `.next` (default)
5. Add Environment Variables:
   - `NEXT_PUBLIC_SUPABASE_URL`: Your Supabase project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Your Supabase anon key

   (You can find these in your Supabase project settings → API)

6. Click **Deploy**

### Option B: Deploy via Vercel CLI

```bash
npm install -g vercel
vercel login
vercel

# Follow the prompts
# When asked about environment variables, add:
# - NEXT_PUBLIC_SUPABASE_URL
# - NEXT_PUBLIC_SUPABASE_ANON_KEY
```

## Step 6: Update Supabase Site URL

After deployment:

1. Copy your Vercel deployment URL (e.g., `https://your-app.vercel.app`)
2. Go back to Supabase → **Authentication** → **URL Configuration**
3. Update the **Site URL** to your Vercel URL
4. Add your Vercel URL to **Redirect URLs**

## Step 7: Test Your Deployment

1. Visit your deployed app URL
2. Create an organizer account
3. Create a test event
4. Add task types and tasks
5. Share the event link and test volunteer signup/assignment

## Environment Variables Reference

Make sure these are set in your Vercel project settings:

| Variable | Description | Where to find |
|----------|-------------|---------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL | Supabase → Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anonymous key | Supabase → Settings → API → Project API keys → anon public |

## Alternative Deployment Options

### Deploy to Netlify

1. Connect your GitHub repository to Netlify
2. Build command: `npm run build`
3. Publish directory: `.next`
4. Add the same environment variables
5. Deploy

### Deploy to Your Own Server

If you have your own server:

```bash
# Build the application
npm run build

# Start the production server
npm start
```

Make sure Node.js 18+ is installed on your server.

## Continuous Deployment

Once connected to GitHub:

1. Any push to the `main` branch will automatically deploy
2. Pull requests create preview deployments
3. You can configure deployment settings in Vercel/Netlify dashboard

## Performance Optimization

The app is already optimized for 50+ concurrent users with:

- Database indexes on all frequently queried columns
- Supabase Row Level Security for data protection
- Real-time subscriptions for instant updates
- Efficient queries with proper filtering

## Troubleshooting

### Issue: Authentication not working after deployment

**Solution**: Make sure your Vercel URL is added to Supabase's Redirect URLs

### Issue: Database connection errors

**Solution**: Verify environment variables are set correctly in Vercel

### Issue: Real-time updates not working

**Solution**: Check that your Supabase project has Realtime enabled (it should be by default)

## Monitoring

- **Vercel Analytics**: Monitor page views and performance
- **Supabase Logs**: Check database queries and authentication logs
- **Vercel Logs**: View application logs and errors

## Support

For issues or questions:
- Check the README.md for feature documentation
- Review Vercel deployment logs
- Check Supabase logs for database errors
