import React from 'react'

export default function Index({ time }) {
  return (
    <main>
      <h1>SSR Caching with Next.js</h1>
      <time dateTime={time}>{time}</time>
    </main>
  )
}

export async function getServerSideProps({ req, res }) {
  res.setHeader(
    'Cache-Control',
    'public, s-maxage=10, stale-while-revalidate=59'
  )
  res.setHeader('x-react-version', React.version)

  return {
    props: {
      time: new Date().toISOString(),
    },
  }
}
