import React, { useState, useEffect } from 'react'
import { Routes, Route, useNavigate } from 'react-router-dom'
import {
  AppBar, Toolbar, Typography, Container, Box, Button,
  IconButton, Tooltip
} from '@mui/material'
import HomeIcon from '@mui/icons-material/Home'
import AddIcon from '@mui/icons-material/Add'
import DescriptionIcon from '@mui/icons-material/Description'
import Dashboard from './pages/Dashboard.jsx'
import ExperimentDetail from './pages/ExperimentDetail.jsx'
import ReportPreview from './pages/ReportPreview.jsx'
import ReportCenter from './pages/ReportCenter.jsx'
import CreateExperimentModal from './components/CreateExperimentModal.jsx'

export default function App() {
  const navigate = useNavigate()
  const [openCreateModal, setOpenCreateModal] = useState(false)

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <AppBar position="static" elevation={1}>
        <Toolbar>
          <IconButton
            edge="start"
            color="inherit"
            onClick={() => navigate('/')}
            sx={{ mr: 2 }}
          >
            <HomeIcon />
          </IconButton>
          <Typography
            variant="h6"
            component="div"
            sx={{ flexGrow: 1, fontWeight: 600 }}
          >
            联邦学习安全聚合与模型训练实验平台
          </Typography>
          <Tooltip title="报告中心">
            <Button
              color="inherit"
              startIcon={<DescriptionIcon />}
              variant="outlined"
              sx={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)', mr: 2 }}
              onClick={() => navigate('/reports')}
            >
              报告中心
            </Button>
          </Tooltip>
          <Tooltip title="创建新实验">
            <Button
              color="inherit"
              startIcon={<AddIcon />}
              variant="outlined"
              sx={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)' }}
              onClick={() => setOpenCreateModal(true)}
            >
              新建实验
            </Button>
          </Tooltip>
        </Toolbar>
      </AppBar>

      <Container
        component="main"
        sx={{ flex: 1, py: 3, px: { xs: 2, sm: 4 } }}
        maxWidth={false}
      >
        <Routes>
          <Route path="/" element={<Dashboard onNewExperiment={() => setOpenCreateModal(true)} />} />
          <Route path="/experiment/:id" element={<ExperimentDetail />} />
          <Route path="/reports" element={<ReportCenter />} />
          <Route path="/report/:id" element={<ReportPreview />} />
        </Routes>
      </Container>

      <Box
        component="footer"
        sx={{ py: 3, px: 2, mt: 'auto', backgroundColor: 'white', borderTop: 1, borderColor: 'divider' }}
      >
        <Container maxWidth={false}>
          <Typography variant="body2" color="text.secondary" align="center">
            FedLearn Platform © 2025 - 联邦学习安全聚合与模型训练实验平台
          </Typography>
        </Container>
      </Box>

      <CreateExperimentModal
        open={openCreateModal}
        onClose={() => setOpenCreateModal(false)}
      />
    </Box>
  )
}
