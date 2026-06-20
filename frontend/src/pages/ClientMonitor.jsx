import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box, Paper, Typography, Grid, Chip, FormControl, InputLabel,
  Select, MenuItem, Stack, Alert, CircularProgress
} from '@mui/material'
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart'
import { experimentApi } from '../services/api'
import { createWebSocket } from '../services/websocket'
import ClientOverviewCards from '../components/ClientOverviewCards.jsx'
import ClientAccuracyHeatmap from '../components/ClientAccuracyHeatmap.jsx'
import ClientCommunicationBar from '../components/ClientCommunicationBar.jsx'

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

  const wsRef = useRef(null)

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
      const res = await experimentApi.getClientMetrics(expId)
      setClientMetricsHistory(res.data.client_metrics_history || [])
      setNumClients(res.data.num_clients || 0)
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
        } else if (m.participated) {
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
              <Stack direction="row" spacing={2} justifyContent="flex-end" flexWrap="wrap">
                <Box sx={{ textAlign: 'right' }}>
                  <Typography variant="caption" color="text.secondary">客户端数</Typography>
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>{numClients}</Typography>
                </Box>
                <Box sx={{ textAlign: 'right' }}>
                  <Typography variant="caption" color="text.secondary">已完成轮次</Typography>
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>{clientMetricsHistory.length}</Typography>
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
              </Stack>
            </Grid>
          )}
        </Grid>
      </Paper>

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

      {selectedExperimentId && !loading && clientMetricsHistory.length > 0 && (
        <Stack spacing={3}>
          <ClientOverviewCards
            clients={clientStats}
            currentRound={clientMetricsHistory.length}
          />

          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
              客户端精度热力图
            </Typography>
            <ClientAccuracyHeatmap
              clientMetricsHistory={clientMetricsHistory}
              numClients={numClients}
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
        </Stack>
      )}

      {selectedExperimentId && !loading && clientMetricsHistory.length === 0 && (
        <Paper sx={{ p: 6, textAlign: 'center' }}>
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
