import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box, Typography, Paper, Button, IconButton, Tooltip, LinearProgress,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TextField, InputAdornment, Alert, Snackbar, Dialog, DialogActions,
  DialogContent, DialogContentText, DialogTitle, Stack
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import VisibilityIcon from '@mui/icons-material/Visibility'
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf'
import DeleteIcon from '@mui/icons-material/Delete'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import DescriptionIcon from '@mui/icons-material/Description'
import { format } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { reportApi } from '../services/api'

function formatFileSize(bytes) {
  if (bytes == null) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

export default function ReportCenter() {
  const navigate = useNavigate()
  const [reports, setReports] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [searchText, setSearchText] = useState('')
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' })
  const [deleteDialog, setDeleteDialog] = useState({ open: false, reportId: null, reportTitle: '' })
  const [downloadingId, setDownloadingId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)

  const loadReports = async (search = '') => {
    try {
      setLoading(true)
      const params = { sort_by: 'created_at_desc' }
      if (search.trim()) {
        params.search = search.trim()
      }
      const res = await reportApi.list(params)
      setReports(res.data.reports)
      setTotal(res.data.total)
    } catch (e) {
      showSnackbar('加载报告列表失败', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadReports(searchText)
  }, [])

  const showSnackbar = (message, severity = 'info') => {
    setSnackbar({ open: true, message, severity })
  }

  const handleSearch = (e) => {
    const value = e.target.value
    setSearchText(value)
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      loadReports(searchText)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchText])

  const handleView = (id) => {
    navigate(`/report/${id}`)
  }

  const handleDownload = async (report) => {
    try {
      setDownloadingId(report.id)
      await reportApi.downloadPdf(report.id)
      showSnackbar('PDF下载已开始', 'success')
    } catch (e) {
      showSnackbar('下载PDF失败', 'error')
    } finally {
      setDownloadingId(null)
    }
  }

  const handleDeleteClick = (report) => {
    setDeleteDialog({ open: true, reportId: report.id, reportTitle: report.title })
  }

  const handleDeleteConfirm = async () => {
    const id = deleteDialog.reportId
    try {
      setDeletingId(id)
      await reportApi.delete(id)
      showSnackbar('报告已删除', 'success')
      setDeleteDialog({ open: false, reportId: null, reportTitle: '' })
      loadReports(searchText)
    } catch (e) {
      showSnackbar('删除报告失败', 'error')
    } finally {
      setDeletingId(null)
    }
  }

  const handleDeleteCancel = () => {
    setDeleteDialog({ open: false, reportId: null, reportTitle: '' })
  }

  return (
    <Box>
      <Paper sx={{ p: 3, mb: 3 }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <IconButton onClick={() => navigate('/')}>
            <ArrowBackIcon />
          </IconButton>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h5" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
              <DescriptionIcon color="primary" />
              报告中心
            </Typography>
            <Typography variant="body2" color="text.secondary">
              共 {total} 份报告
            </Typography>
          </Box>
          <TextField
            placeholder="按标题搜索..."
            value={searchText}
            onChange={handleSearch}
            size="small"
            sx={{ width: 280 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
          />
        </Stack>
      </Paper>

      {loading && <LinearProgress sx={{ mb: 2 }} />}

      {reports.length === 0 && !loading && (
        <Alert severity="info" sx={{ borderRadius: 3 }}>
          暂无报告。请在实验列表中选择2-5个已完成的实验生成对比报告。
        </Alert>
      )}

      {reports.length > 0 && (
        <Paper sx={{ overflow: 'hidden' }}>
          <TableContainer>
            <Table>
              <TableHead sx={{ backgroundColor: '#f5f5f5' }}>
                <TableRow>
                  <TableCell sx={{ fontWeight: 'bold', width: '40%' }}>报告标题</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', width: '15%' }}>实验数量</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', width: '20%' }}>创建时间</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', width: '10%' }}>PDF大小</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', width: '15%' }} align="center">操作</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {reports.map((report) => (
                  <TableRow key={report.id} hover>
                    <TableCell>
                      <Box>
                        <Typography variant="body1" sx={{ fontWeight: 500 }}>
                          {report.title}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          #{report.id}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>{report.experiment_ids?.length || 0} 个</TableCell>
                    <TableCell>
                      {format(new Date(report.created_at), 'yyyy-MM-dd HH:mm', { locale: zhCN })}
                    </TableCell>
                    <TableCell>{formatFileSize(report.pdf_size)}</TableCell>
                    <TableCell align="center">
                      <Stack direction="row" spacing={0.5} justifyContent="center">
                        <Tooltip title="查看">
                          <IconButton
                            size="small"
                            color="primary"
                            onClick={() => handleView(report.id)}
                          >
                            <VisibilityIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="下载PDF">
                          <span>
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => handleDownload(report)}
                              disabled={downloadingId === report.id}
                            >
                              <PictureAsPdfIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title="删除">
                          <span>
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => handleDeleteClick(report)}
                              disabled={deletingId === report.id}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      <Dialog
        open={deleteDialog.open}
        onClose={handleDeleteCancel}
      >
        <DialogTitle>确认删除</DialogTitle>
        <DialogContent>
          <DialogContentText>
            确定要删除报告「{deleteDialog.reportTitle}」吗？此操作不可恢复。
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteCancel} disabled={deletingId != null}>
            取消
          </Button>
          <Button onClick={handleDeleteConfirm} color="error" disabled={deletingId != null}>
            {deletingId != null ? '删除中...' : '删除'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar(s => ({ ...s, open: false }))}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar(s => ({ ...s, open: false }))}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  )
}
