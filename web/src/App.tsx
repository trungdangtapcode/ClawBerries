import { BrowserRouter, Routes, Route } from "react-router-dom"
import { Layout } from "@/components/Layout"
import { Dashboard } from "@/pages/Dashboard"
import { CVSearch } from "@/pages/CVSearch"
import { ResumeProfile } from "@/pages/ResumeProfile"
import { Interviews } from "@/pages/Interviews"
import { Documents } from "@/pages/Documents"
import "./index.css"

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/cv-search" element={<CVSearch />} />
          <Route path="/resume/:id" element={<ResumeProfile />} />
          {/* Placeholder routes for navigation items */}
          <Route path="/pipeline" element={<Dashboard />} />
          <Route path="/interviews" element={<Interviews />} />
          <Route path="/documents" element={<Documents />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
