// dashboard/src/pages/_app.js
import '../styles.css'; // This imports your global styles

// This default export is required for Next.js
export default function MyApp({ Component, pageProps }) {
  return <Component {...pageProps} />;
}