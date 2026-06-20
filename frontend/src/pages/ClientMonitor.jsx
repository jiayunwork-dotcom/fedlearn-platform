import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box, Paper, Typography, Grid, Chip, FormControl, InputLabel,
  Select, MenuItem, Stack, Alert, CircularProgress, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions, Button,
  Slider, Tooltip
} from '@mui/material'
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart'
import SettingsIcon from '@mui/icons-material/Settings'
import CloseIcon from '@mui/icons-material/Close'
import { experimentApi } from '../services/api'
import { createWebSocket } from '../services/websocket'
import ClientOverviewCards from '../components/ClientOverviewCards.jsx'
import ClientAccuracyHeatmap from '../components/ClientAccuracyHeatmap.jsx'
import ClientCommunicationBar from '../components/ClientCommunicationBar.jsx'
import AnomalyEventTimeline from '../components/AnomalyEventTimeline.jsx'
import { detectAnomalies, DEFAULT_THRESHOLDS } from '../utils/anomalyDetection'

const STATUS_TEXT = {
  pending: '待启动', queued: '排队中', running: '运行中',
  completed: '已完成', stopped: '已停止', error: '错误', privacy_exceeded: '隐私超限'
}

export default function ClientMonitor() {
  const navigate = useNavigate()
  const [experiments, setExperiments] = useState([])
  const [selectedExperimentId, setSelectedExperimentId] = useState(null)
  const [selectedExperiment, setSelectedExperiment] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const [clientMetricsHistory, setClientMetricsHistory] = useState([])
  const [numClients, setNumClients] = useState(0)
  const [totalRounds, setTotalRounds] = useState(0)

  const [thresholds, setThresholds] = useState(() => {
    try {
      const saved = localStorage.getItem('anomalyThresholds')
      if (saved) {
        return JSON.parse(saved)
      }
    } catch (e) {
      // ignore
    }
    return { ...DEFAULT_THRESHOLDS }
  })
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [tempAccuracyDrop, setTempAccuracyDrop] = useState(thresholds.accuracyDropPercent)
  const [tempLossRiseMultiplier, setTempLossRiseMultiplier] = useState(thresholds.lossRiseMultiplier)

  const wsRef = useRef(null)

  const anomalyResult = useMemo(() => {
    return detectAnomalies(clientMetricsHistory, numClients, thresholds)
  }, [clientMetricsHistory, numClients, thresholds])

  const { anomalyClients, anomalyEvents, roundAnomalies, clientAnomalyInfo } = anomalyResult

  const persistThresholds = useCallback((newThresholds) => {
    try {
      localStorage.setItem('anomalyThresholds', JSON.stringify(newThresholds))
    } catch (e) {
      // ignore
    }
  }, [])

  const handleOpenSettings = () => {
    setTempAccuracyDrop(thresholds.accuracyDropPercent)
    setTempLossRiseMultiplier(thresholds.lossRiseMultiplier)
    setSettingsOpen(true)
  }

  const handleSaveSettings = () => {
    const newThresholds = {
      accuracyDropPercent: tempAccuracyDrop,
      lossRiseMultiplier: tempLossRiseMultiplier
    }
    setThresholds(newThresholds)
    persistThresholds(newThresholds)
    setSettingsOpen(false)
  }

  const handleResetSettings = () => {
    setTempAccuracyDrop(DEFAULT_THRESHOLDS.accuracyDropPercent)
    setTempLossRiseMultiplier(DEFAULT_THRESHOLDS.lossRiseMultiplier)
  }

  const loadExperiments = useCallback(async () => {
    try {
      const res = await experimentApi.list({ limit: 50 })
      setExperiments(res.data.experiments || [])
    } catch (e) {
      console.error('Failed to load experiments:', e)
    }
  }, [])

  const loadClientMetrics = useCallback(async (expId) => {
    try {
      setLoading(true)
      const [metricsRes, roundsRes] = await Promise.all([
        experimentApi.getClientMetrics(expId),
        experimentApi.getRounds(expId)
      ])
      setClientMetricsHistory(metricsRes.data.client_metrics_history || [])
      setNumClients(metricsRes.data.num_clients || 0)
      setTotalRounds(roundsRes.data.total_rounds || 0)
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadExperiment = useCallback(async (expId) => {
    try {
      const res = await experimentApi.get(expId)
      setSelectedExperiment(res.data)
    } catch (e) {
      console.error('Failed to load experiment:', e)
    }
  }, [])

  const handleExperimentChange = useCallback((expId) => {
    const expIdNum = parseInt(expId)
    setSelectedExperimentId(expIdNum)
    setClientMetricsHistory([])
    setNumClients(0)
    setTotalRounds(0)
    setSelectedExperiment(null)
    setError(null)

    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }

    if (!expIdNum) {
      return
    }

    loadExperiment(expIdNum)
    loadClientMetrics(expIdNum)

    const exp = experiments.find(e => e.id === expIdNum)
    if (exp && (exp.status === 'running' || exp.status === 'queued')) {
      const ws = createWebSocket(expIdNum, {
        onClientMetrics: (data) => {
          setClientMetricsHistory(prev => {
            const exists = prev.some(r => r.round_num === data.round_num)
            if (exists) {
              return prev
            }
            return [...prev, {
              round_num: data.round_num,
              client_metrics: data.client_metrics
            }]
          })
        },
        onMessage: (data) => {
          if (data.type === 'client_metrics') {
            setClientMetricsHistory(prev => {
              const exists = prev.some(r => r.round_num === data.round_num)
              if (exists) {
                return prev
              }
              return [...prev, {
                round_num: data.round_num,
                client_metrics: data.client_metrics
              }]
            })
          }
          if (data.type === 'completed' || data.type === 'experiment_stopped' || data.type === 'error') {
            loadExperiment(expIdNum)
          }
        }
      })
      wsRef.current = ws
    }
  }, [experiments, loadExperiment, loadClientMetrics])

  useEffect(() => {
    loadExperiments()
  }, [loadExperiments])

  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [])

  const runningExperiments = experiments.filter(e => e.status === 'running' || e.status === 'queued')
  const completedExperiments = experiments.filter(e => e.status === 'completed' || e.status === 'stopped' || e.status === 'error')

  const computeClientStats = () => {
    const stats = {}
    const totalComm = {}
    const participatedRounds = {}
    const isCompleted = selectedExperiment?.status === 'completed' ||
                        selectedExperiment?.status === 'stopped' ||
                        selectedExperiment?.status === 'error' ||
                        selectedExperiment?.status === 'privacy_exceeded'

    for (let i = 0; i < numClients; i++) {
      stats[i] = {
        client_id: i,
        status: 'idle',
        latest_loss: null,
        latest_accuracy: null,
        participated_rounds: 0,
        total_communication: 0,
        is_byzantine: false
      }
      totalComm[i] = 0
      participatedRounds[i] = 0
    }

    clientMetricsHistory.forEach(roundData => {
      const metrics = roundData.client_metrics
      Object.keys(metrics).forEach(key => {
        const m = metrics[key]
        const cid = m.client_id

        if (m.participated) {
          participatedRounds[cid] = (participatedRounds[cid] || 0) + 1
          totalComm[cid] = (totalComm[cid] || 0) + (m.communication_bytes || 0)
        }

        if (m.is_byzantine) {
          stats[cid].is_byzantine = true
        }
      })
    })

    if (clientMetricsHistory.length > 0) {
      const latestRound = clientMetricsHistory[clientMetricsHistory.length - 1]
      const latestMetrics = latestRound.client_metrics

      Object.keys(latestMetrics).forEach(key => {
        const m = latestMetrics[key]
        const cid = m.client_id

        if (m.is_byzantine) {
          stats[cid].status = 'malicious'
        } else if (m.participated && !isCompleted) {
          stats[cid].status = 'training'
        } else {
          stats[cid].status = 'idle'
        }

        stats[cid].latest_loss = m.loss
        stats[cid].latest_accuracy = m.accuracy
        stats[cid].participated_rounds = participatedRounds[cid] || 0
        stats[cid].total_communication = totalComm[cid] || 0
        stats[cid].is_byzantine = m.is_byzantine
      })
    }

    return Object.values(stats).sort((a, b) => a.client_id - b.client_id)
  }

  const clientStats = computeClientStats()

  return (
    <Box>
      <Paper sx={{ p: 3, mb: 3 }}>
        <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 3 }}>
          <MonitorHeartIcon color="primary" sx={{ fontSize: 32 }} />
          <Box sx={{ flex: 1 }}>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              客户端监控
            </Typography>
            <Typography variant="body2" color="text.secondary">
              实时监控各客户端训练状态与指标
            </Typography>
          </Box>
        </Stack>

        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <FormControl fullWidth>
              <InputLabel>选择实验</InputLabel>
              <Select
                value={selectedExperimentId || ''}
                label="选择实验"
                onChange={(e) => handleExperimentChange(e.target.value)}
              >
                <MenuItem value="">
                  <em>请选择一个实验</em>
                </MenuItem>
                {runningExperiments.length > 0 && (
                  <MenuItem disabled>
                    <strong>运行中的实验</strong>
                  </MenuItem>
                )}
                {runningExperiments.map(exp => (
                  <MenuItem key={exp.id} value={exp.id}>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ width: '100%' }}>
                      <Chip
                        label={STATUS_TEXT[exp.status] || exp.status}
                        size="small"
                        color={exp.status === 'running' ? 'primary' : 'info'}
                        sx={{ mr: 1 }}
                      />
                      <span>{exp.name}</span>
                      <Typography variant="caption" color="text.secondary">
                        (#{exp.id} · {exp.num_clients}客户端)
                      </Typography>
                    </Stack>
                  </MenuItem>
                ))}
                {completedExperiments.length > 0 && (
                  <MenuItem disabled>
                    <strong>已完成的实验</strong>
                  </MenuItem>
                )}
                {completedExperiments.map(exp => (
                  <MenuItem key={exp.id} value={exp.id}>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ width: '100%' }}>
                      <Chip
                        label={STATUS_TEXT[exp.status] || exp.status}
                        size="small"
                        color={exp.status === 'completed' ? 'success' : 'default'}
                        sx={{ mr: 1 }}
                      />
                      <span>{exp.name}</span>
                      <Typography variant="caption" color="text.secondary">
                        (#{exp.id} · {exp.num_clients}客户端)
                      </Typography>
                    </Stack>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          {selectedExperiment && (
            <Grid item xs={12} md={6}>
              <Stack direction="row" spacing={2} justifyContent="flex-end" flexWrap="wrap" alignItems="center">
                <Box sx={{ textAlign: 'right' }}>
                  <Typography variant="caption" color="text.secondary">客户端数</Typography>
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>{numClients}</Typography>
                </Box>
                <Box sx={{ textAlign: 'right' }}>
                  <Typography variant="caption" color="text.secondary">已完成轮次</Typography>
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>{totalRounds}</Typography>
                </Box>
                <Box sx={{ textAlign: 'right' }}>
                  <Typography variant="caption" color="text.secondary">实验状态</Typography>
                  <Chip
                    label={STATUS_TEXT[selectedExperiment.status] || selectedExperiment.status}
                    size="small"
                    color={
                      selectedExperiment.status === 'running' ? 'primary' :
                      selectedExperiment.status === 'completed' ? 'success' :
                      selectedExperiment.status === 'error' ? 'error' : 'default'
                    }
                  />
                </Box>
                <Tooltip title="告警阈值设置" placement="top">
                  <IconButton
                    onClick={handleOpenSettings}
                    sx={{
                      border: 1,
                      borderColor: 'divider',
                      bgcolor: anomalyClients.length > 0 ? 'error.light' : 'background.paper',
                      '&:hover': { bgcolor: 'action.hover' }
                    }}
                  >
                    <SettingsIcon sx={{ color: anomalyClients.length > 0 ? 'error.main' : 'action.active' }} />
                  </IconButton>
                </Tooltip>
              </Stack>
            </Grid>
          )}
        </Grid>
      </Paper>

      <Dialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>告警阈值设置</Typography>
          <IconButton onClick={() => setSettingsOpen(false)} size="small">
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <Box sx={{ pt: 2 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              自定义异常判定阈值，修改后立即生效（仅保存在本地浏览器）。
            </Typography>

            <Box sx={{ mb: 4 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 1 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  精度下降幅度阈值
                </Typography>
                <Typography variant="body1" sx={{ fontFamily: 'monospace', fontWeight: 700, color: 'warning.main' }}>
                  {tempAccuracyDrop} 个百分点
                </Typography>
              </Stack>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                当某客户端最新一轮精度相比历史均值下降超过该值时，判定为异常
              </Typography>
              <Slider
                value={tempAccuracyDrop}
                onChange={(e, v) => setTempAccuracyDrop(v)}
                min={5}
                max={50}
                step={1}
                marks={[
                  { value: 5, label: '5%' },
                  { value: 20, label: '20%' },
                  { value: 50, label: '50%' }
                ]}
                valueLabelDisplay="auto"
              />
            </Box>

            <Box>
              <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 1 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  Loss 上升倍率阈值
                </Typography>
                <Typography variant="body1" sx={{ fontFamily: 'monospace', fontWeight: 700, color: 'secondary.main' }}>
                  {tempLossRiseMultiplier.toFixed(1)} 倍
                </Typography>
              </Stack>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                当连续2轮 Loss 上升且最新 Loss 超过历史均值该倍数时，判定为异常
              </Typography>
              <Slider
                value={tempLossRiseMultiplier}
                onChange={(e, v) => setTempLossRiseMultiplier(v)}
                min={1.1}
                max={3.0}
                step={0.1}
                marks={[
                  { value: 1.1, label: '1.1x' },
                  { value: 1.5, label: '1.5x' },
                  { value: 3.0, label: '3.0x' }
                ]}
                valueLabelDisplay="auto"
                valueLabelFormat={(v) => `${v.toFixed(1)}x`}
              />
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2, justifyContent: 'space-between' }}>
          <Button onClick={handleResetSettings} color="inherit">
            恢复默认
          </Button>
          <Stack direction="row" spacing={1}>
            <Button onClick={() => setSettingsOpen(false)} color="inherit">
              取消
            </Button>
            <Button onClick={handleSaveSettings} variant="contained" color="primary">
              保存并应用
            </Button>
          </Stack>
        </DialogActions>
      </Dialog>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          加载失败: {error}
        </Alert>
      )}

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      )}

      {!selectedExperimentId && !loading && (
        <Paper sx={{ p: 6, textAlign: 'center' }}>
          <MonitorHeartIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
          <Typography variant="h6" color="text.secondary" sx={{ mb: 1 }}>
            请选择一个实验开始监控
          </Typography>
          <Typography variant="body2" color="text.disabled">
            选择运行中的实验可实时接收客户端指标，选择已完成实验可查看历史数据
          </Typography>
        </Paper>
      )}

      {selectedExperimentId && !loading && totalRounds > 0 && (
        <Stack spacing={3}>
          <ClientOverviewCards
            clients={clientStats}
            currentRound={totalRounds}
            anomalyClients={anomalyClients}
            clientAnomalyInfo={clientAnomalyInfo}
          />

          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
              客户端精度热力图
            </Typography>
            <ClientAccuracyHeatmap
              clientMetricsHistory={clientMetricsHistory}
              numClients={numClients}
              roundAnomalies={roundAnomalies}
              clientAnomalyInfo={clientAnomalyInfo}
            />
          </Paper>

          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
              客户端累计通信量
            </Typography>
            <ClientCommunicationBar
              clientStats={clientStats}
              numClients={numClients}
            />
          </Paper>

          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
              异常事件时间线
            </Typography>
            <AnomalyEventTimeline
              anomalyEvents={anomalyEvents}
              totalRounds={totalRounds}
              clientMetricsHistory={clientMetricsHistory}
            />
          </Paper>
        </Stack>
      )}

      {selectedExperimentId && !loading && totalRounds > 0 && clientMetricsHistory.length === 0 && (
        <Paper sx={{ p: 6, textAlign: 'center', mt: 3 }}>
          <Typography variant="h6" color="text.secondary" sx={{ mb: 1 }}>
            该实验无客户端详细指标数据
          </Typography>
          <Typography variant="body2" color="text.disabled">
            该实验为较早版本创建，仅包含概览卡片数据，无客户端详细指标（热力图、通信量）
          </Typography>
        </Paper>
      )}

      {selectedExperimentId && !loading && totalRounds === 0 && (
        <Paper sx={{ p: 6, textAlign: 'center', mt: 3 }}>
          <Typography variant="h6" color="text.secondary" sx={{ mb: 1 }}>
            暂无客户端指标数据
          </Typography>
          <Typography variant="body2" color="text.disabled">
            该实验尚未开始训练或没有可用的客户端指标数据
          </Typography>
        </Paper>
      )}
    </Box>
  )
}
