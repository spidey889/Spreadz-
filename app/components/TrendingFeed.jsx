'use client'

import { useEffect, useState } from 'react'

const TOP_STORIES_ENDPOINT =
  'https://hacker-news.firebaseio.com/v0/topstories.json'
const STORY_ENDPOINT = (id) =>
  `https://hacker-news.firebaseio.com/v0/item/${id}.json`
const STORY_LIMIT = 10

export default function TrendingFeed() {
  const [stories, setStories] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()

    async function loadStories() {
      setIsLoading(true)
      setError('')

      try {
        const topStoriesResponse = await fetch(TOP_STORIES_ENDPOINT, {
          signal: controller.signal,
        })

        if (!topStoriesResponse.ok) {
          throw new Error('Unable to load top story ids.')
        }

        const storyIds = await topStoriesResponse.json()
        const storyResponses = await Promise.all(
          storyIds.slice(0, STORY_LIMIT).map(async (id) => {
            const response = await fetch(STORY_ENDPOINT(id), {
              signal: controller.signal,
            })

            if (!response.ok) {
              throw new Error(`Unable to load story ${id}.`)
            }

            return response.json()
          })
        )

        const nextStories = storyResponses
          .filter(Boolean)
          .map((story) => ({
            id: story.id,
            score: typeof story.score === 'number' ? story.score : 0,
            title: story.title || 'Untitled story',
          }))

        setStories(nextStories)
      } catch (fetchError) {
        if (controller.signal.aborted) {
          return
        }

        setStories([])
        setError('Could not load trending Hacker News stories right now.')
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false)
        }
      }
    }

    loadStories()

    return () => {
      controller.abort()
    }
  }, [])

  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-[0.28em] text-orange-300">
          Live Feed
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          Trending on Hacker News
        </h1>
        <p className="max-w-2xl text-sm text-slate-300 sm:text-base">
          Top 10 stories pulled directly from the Hacker News API.
        </p>
      </div>

      {isLoading ? (
        <div className="grid gap-4">
          {Array.from({ length: STORY_LIMIT }).map((_, index) => (
            <article
              key={index}
              className="animate-pulse rounded-2xl border border-white/10 bg-white/5 p-5"
            >
              <div className="mb-4 h-5 w-28 rounded-full bg-white/10" />
              <div className="mb-3 h-6 w-3/4 rounded-full bg-white/10" />
              <div className="h-4 w-24 rounded-full bg-white/10" />
            </article>
          ))}
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-5 text-sm text-red-100">
          {error}
        </div>
      ) : (
        <div className="grid gap-4">
          {stories.map((story, index) => (
            <article
              key={story.id}
              className="rounded-2xl border border-white/10 bg-slate-900/70 p-5 shadow-[0_18px_50px_rgba(0,0,0,0.28)] backdrop-blur"
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="rounded-full bg-orange-400/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-orange-200">
                  Story {index + 1}
                </span>
                <span className="text-sm font-medium text-slate-300">
                  Score: {story.score}
                </span>
              </div>
              <h2 className="text-lg font-semibold leading-7 text-white sm:text-xl">
                {story.title}
              </h2>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
