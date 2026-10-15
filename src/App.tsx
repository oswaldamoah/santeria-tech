import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { lazy, Suspense, useEffect } from 'react'
import { HashRouter, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { BagSheet } from './components/BagSheet'
import { AddedToast, FlyLayer } from './components/FlyLayer'
import { Footer } from './components/Footer'
import { Nav } from './components/Nav'
import { BagProvider } from './lib/bag'
import CategoryPage from './pages/CategoryPage'
import Home from './pages/Home'
import OrderPage from './pages/OrderPage'
import SentPage from './pages/SentPage'

function CategoryRoute() {
  const { id } = useParams()
  return <CategoryPage key={id} />
}

function Pages() {
  const location = useLocation()

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }, [location.pathname])

  return (
    <AnimatePresence mode="wait">
      <motion.main
        key={location.pathname}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.22 }}
      >
        <Routes location={location}>
          <Route path="/" element={<Home />} />
          <Route path="/sell/:id" element={<CategoryRoute />} />
          <Route path="/order" element={<OrderPage />} />
          <Route path="/sent" element={<SentPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </motion.main>
    </AnimatePresence>
  )
}

// The dashboard is its own bundle, so shoppers never download it.
const AdminApp = lazy(() => import('./admin/AdminApp'))

function Shell() {
  const { pathname } = useLocation()
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    return (
      <Suspense fallback={<div style={{ minHeight: '100vh', background: 'var(--gray)' }} />}>
        <AdminApp />
      </Suspense>
    )
  }
  return (
    <BagProvider>
      <Nav />
      <Pages />
      <Footer />
      <BagSheet />
      <FlyLayer />
      <AddedToast />
    </BagProvider>
  )
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <HashRouter>
        <Shell />
      </HashRouter>
    </MotionConfig>
  )
}
