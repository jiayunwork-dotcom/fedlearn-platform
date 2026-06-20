import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box, Typography, Paper, Grid, Card, CardContent,
  Chip, Stack, Button, IconButton, Tooltip, LinearProgress,
  Alert, Snackbar
} from '@mui/material'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import StopIcon from '@mui/icons-material/Stop'
import DeleteIcon from '@mui/icons-material/Delete'
import VisibilityIcon from '@mui/icons-material/Visibility'
import CompareArrowsIcon from '@mui/icons-material/CompareArrows'
import { format } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { experimentApi } from '../services/api'
import AccuracyChart from '../components/AccuracyChart.jsx'
import CompareExperimentsModal from '../components/CompareExperimentsModal.jsx'

const STATUS_COLORS = {
  pending: 'default',
  queued: 'info',
  running: 'primary',
  completed: 'success',
  stopped: 'warning',
  error: 'error',
  privacy_exceeded: 'warning'
}

const STATUS_TEXT = {
  pending: '待启动',
  queued: '排队中',
  running: '运行中',
  completed: '已完成',
  stopped: '已停止',
  error: '错误',
  privacy_exceeded: '隐私超限'
}

export default function Dashboard({ onNewExperiment }) {
  const navigate = useNavigate()
  const [experiments, setExperiments] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedIds, setSelectedIds] = useState([])
  const [compareOpen, setCompareOpen] = useState(false)
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' })
  const [total, setTotal] = useState(0)

  const loadExperiments = async () => {
    try {
      setLoading(true)
      const res = await experimentApi.list({ limit: 50 })
      setExperiments(res.data.experiments)
      setTotal(res.data.total)
    } catch (e) {
      showSnackbar('加载实验列表失败', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadExperiments()
    const interval = setInterval(loadExperiments, 5000)
    return () => clearInterval(interval)
  }, [])

  const showSnackbar = (message, severity = 'info') => {
    setSnackbar({ open: true, message, severity })
  }

  const handleStart = async (id) => {
    try {
      await experimentApi.start(id)
      showSnackbar('实验已启动', 'success')
      loadExperiments()
    } catch (e) {
      showSnackbar(e.response?.data?.detail || '启动失败', 'error')
    }
  }

  const handleStop = async (id) => {
    try {
      await experimentApi.stop(id)
      showSnackbar('正在停止实验', 'info')
      loadExperiments()
    } catch (e) {
      showSnackbar(e.response?.data?.detail || '停止失败', 'error')
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('确定要删除这个实验吗？')) return
    try {
      await experimentApi.delete(id)
      showSnackbar('实验已删除', 'success')
      setSelectedIds(ids => ids.filter(x => x !== id))
      loadExperiments()
    } catch (e) {
      showSnackbar('删除失败', 'error')
    }
  }

  const toggleSelect = (id) => {
    setSelectedIds(ids => {
      if (ids.includes(id)) return ids.filter(x => x !== id)
      if (ids.length >= 10) return ids
      return [...ids, id]
    })
  }

  const runningCount = experiments.filter(e => e.status === 'running').length
  const completedCount = experiments.filter(e => e.status === 'completed').length
  const avgAccuracy = experiments
    .filter(e => e.final_accuracy)
    .reduce((sum, e) => sum + e.final_accuracy, 0) /
    (experiments.filter(e => e.final_accuracy).length || 1)

  return (
    <Box>
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Paper sx={{ p: 3, textAlign: 'center' }}>
            <Typography variant="h4" color="primary" sx={{ fontWeight: 700 }}>
              {total}
            </Typography>
            <Typography variant="body2" color="text.secondary">总实验数</Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Paper sx={{ p: 3, textAlign: 'center' }}>
            <Typography variant="h4" color="info.main" sx={{ fontWeight: 700 }}>
              {runningCount}
            </Typography>
            <Typography variant="body2" color="text.secondary">运行中</Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Paper sx={{ p: 3, textAlign: 'center' }}>
            <Typography variant="h4" color="success.main" sx={{ fontWeight: 700 }}>
              {completedCount}
            </Typography>
            <Typography variant="body2" color="text.secondary">已完成</Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Paper sx={{ p: 3, textAlign: 'center' }}>
            <Typography variant="h4" color="secondary.main" sx={{ fontWeight: 700 }}>
              {(avgAccuracy * 100).toFixed(1)}%
            </Typography>
            <Typography variant="body2" color="text.secondary">平均最终精度</Typography>
          </Paper>
        </Grid>
      </Grid>

      <Paper sx={{ p: 2, mb: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>实验列表</Typography>
          {selectedIds.length > 0 && (
            <Typography variant="caption" color="text.secondary" sx={{ ml: 2 }}>
              已选择 {selectedIds.length} 个实验进行对比
            </Typography>
          )}
        </Box>
        <Stack direction="row" spacing={2}>
          <Button
            variant="outlined"
            startIcon={<CompareArrowsIcon />}
            disabled={selectedIds.length < 2}
            onClick={() => setCompareOpen(true)}
          >
            对比实验
          </Button>
          <Button variant="contained" onClick={onNewExperiment}>
            + 创建新实验
          </Button>
        </Stack>
      </Paper>

      {loading && <LinearProgress sx={{ mb: 2 }} />}

      <Grid container spacing={3}>
        {experiments.length === 0 && !loading && (
          <Grid item xs={12}>
            <Alert severity="info" sx={{ borderRadius: 3 }}>
              暂无实验。点击"创建新实验"开始配置您的联邦学习实验。
            </Alert>
          </Grid>
        )}

        {experiments.map(exp => (
          <Grid item xs={12} md={6} lg={4} key={exp.id}>
            <Card
              className="card-hover"
              sx={{
                border: selectedIds.includes(exp.id) ? '2px solid' : '1px solid',
                borderColor: selectedIds.includes(exp.id) ? 'primary.main' : 'divider',
                cursor: 'pointer'
              }}
              onClick={() => toggleSelect(exp.id)}
            >
              <CardContent sx={{ p: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                  <Box sx={{ flex: 1, minWidth: 0, mr: 2 }}>
                    <Typography variant="h6" sx={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {exp.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      #{exp.id}
                    </Typography>
                  </Box>
                  <Chip
                    label={STATUS_TEXT[exp.status] || exp.status}
                    color={STATUS_COLORS[exp.status] || 'default'}
                    size="small"
                  />
                </Box>

                <Grid container spacing={1} sx={{ mb: 2 }}>
                  <Grid item xs={6}>
                    <Typography variant="caption" color="text.secondary">数据集</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 500, textTransform: 'uppercase' }}>
                      {exp.dataset_name}
                    </Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="caption" color="text.secondary">模型</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 500, textTransform: 'uppercase' }}>
                      {exp.model_name}
                    </Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="caption" color="text.secondary">算法</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 500, textTransform: 'uppercase' }}>
                      {exp.algorithm}
                    </Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="caption" color="text.secondary">客户端数</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {exp.num_clients}
                    </Typography>
                  </Grid>
                </Grid>

                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 2 }}>
                  {exp.secure_aggregation && <Chip label="安全聚合" size="small" color="primary" variant="outlined" />}
                  {exp.differential_privacy && <Chip label="差分隐私" size="small" color="secondary" variant="outlined" />}
                  {exp.non_iid_mode !== 'iid' && <Chip label={`非IID:${exp.non_iid_mode}`} size="small" color="warning" variant="outlined" />}
                  {exp.num_byzantine > 0 && <Chip label={`拜占庭 x${exp.num_byzantine}`} size="small" color="error" variant="outlined" />}
                  {exp.robust_aggregation !== 'none' && <Chip label={exp.robust_aggregation} size="small" color="info" variant="outlined" />}
                </Box>

                {exp.final_accuracy !== null && (
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="caption" color="text.secondary">最终精度</Typography>
                    <Typography variant="h5" sx={{ fontWeight: 700, color: 'success.main' }}>
                      {(exp.final_accuracy * 100).toFixed(2)}%
                    </Typography>
                  </Box>
                )}

                {exp.differential_privacy && (
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="caption" color="text.secondary">隐私预算消耗</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <LinearProgress
                        variant="determinate"
                        value={Math.min(100, (exp.current_epsilon / (exp.dp_target_epsilon || 1)) * 100)}
                        sx={{ flex: 1 }}
                      />
                      <Typography variant="caption" sx={{ minWidth: 60 }}>
                        {exp.current_epsilon?.toFixed(2) || 0} / {exp.dp_target_epsilon}
                      </Typography>
                    </Box>
                  </Box>
                )}

                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                  创建: {format(new Date(exp.created_at), 'yyyy-MM-dd HH:mm', { locale: zhCN })}
                </Typography>

                <Stack direction="row" spacing={1} onClick={e => e.stopPropagation()}>
                  <Tooltip title="查看详情">
                    <IconButton
                      size="small"
                      color="primary"
                      onClick={() => navigate(`/experiment/${exp.id}`)}
                    >
                      <VisibilityIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  {(exp.status === 'pending' || exp.status === 'stopped' || exp.status === 'error' || exp.status === 'completed') && (
                    <Tooltip title="开始实验">
                      <IconButton
                        size="small"
                        color="success"
                        onClick={() => handleStart(exp.id)}
                      >
                        <PlayArrowIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                  {(exp.status === 'running' || exp.status === 'queued') && (
                    <Tooltip title="停止实验">
                      <IconButton
                        size="small"
                        color="warning"
                        onClick={() => handleStop(exp.id)}
                      >
                        <StopIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                  <Tooltip title="删除">
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => handleDelete(exp.id)}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <CompareExperimentsModal
        open={compareOpen}
        experimentIds={selectedIds}
        onClose={() => setCompareOpen(false)}
      />

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
