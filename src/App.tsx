import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import Layout from '@/components/Layout'
import Providers from '@/pages/Providers'
import Participants from '@/pages/Participants'
import Projects from '@/pages/Projects'
import Discussions from '@/pages/Discussions'
import DiscussionDetail from '@/pages/DiscussionDetail'
import History from '@/pages/History'

export default function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Navigate to="/providers" replace />} />
          <Route path="/providers" element={<Providers />} />
          <Route path="/participants" element={<Participants />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/discussions" element={<Discussions />} />
          <Route path="/discussions/:id" element={<DiscussionDetail />} />
          <Route path="/history" element={<History />} />
        </Routes>
      </Layout>
    </Router>
  )
}
