import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box, Typography, Grid, Card, CardContent, CardActionArea,
  Button, IconButton, Tooltip, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, Snackbar, Alert, Chip
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import DatasetIcon from '@mui/icons-material/Dataset'
import { format } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { datasetApi } from '../services/api'

export default function DatasetList() {
  const navigate = useNavigate()
  const [datasets, setDatasets] = useState([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' })
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingDataset, setEditingDataset] = useState(null)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    num_samples: 1000,
    num_classes: 10,
    feature_dim: 784
  })
  const [formErrors, setFormErrors] = useState({})

  const loadDatasets = async () => {
    try {
      setLoading(true)
      const res = await datasetApi.list({ limit: 100 })
      setDatasets(res.data.datasets)
      setTotal(res.data.total)
    } catch (e) {
      showSnackbar('加载数据集列表失败', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDatasets()
  }, [])

  const showSnackbar = (message, severity = 'info') => {
    setSnackbar({ open: true, message, severity })
  }

  const handleCloseSnackbar = () => {
    setSnackbar({ ...snackbar, open: false })
  }

  const validateForm = () => {
    const errors = {}
    if (!formData.name.trim()) {
      errors.name = '请输入数据集名称'
    }
    if (formData.num_samples < 1) {
      errors.num_samples = '样本总数必须大于0'
    }
    if (formData.num_classes < 1) {
      errors.num_classes = '类别数必须大于0'
    }
    if (formData.feature_dim < 1) {
      errors.feature_dim = '特征维度必须大于0'
    }
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleCreate = async () => {
    if (!validateForm()) return
    try {
      await datasetApi.create(formData)
      showSnackbar('数据集创建成功', 'success')
      setCreateDialogOpen(false)
      resetForm()
      loadDatasets()
    } catch (e) {
      showSnackbar(e.response?.data?.detail || '创建失败', 'error')
    }
  }

  const handleEdit = async () => {
    if (!validateForm()) return
    try {
      await datasetApi.update(editingDataset.id, formData)
      showSnackbar('数据集更新成功', 'success')
      setEditDialogOpen(false)
      setEditingDataset(null)
      resetForm()
      loadDatasets()
    } catch (e) {
      showSnackbar(e.response?.data?.detail || '更新失败', 'error')
    }
  }

  const handleDelete = async (id, e) => {
    e.stopPropagation()
    if (!confirm('确定要删除这个数据集吗？相关的分片方案也会被删除。')) return
    try {
      await datasetApi.delete(id)
      showSnackbar('数据集已删除', 'success')
      loadDatasets()
    } catch (e) {
      showSnackbar('删除失败', 'error')
    }
  }

  const openEditDialog = (dataset, e) => {
    e.stopPropagation()
    setEditingDataset(dataset)
    setFormData({
      name: dataset.name,
      description: dataset.description || '',
      num_samples: dataset.num_samples,
      num_classes: dataset.num_classes,
      feature_dim: dataset.feature_dim
    })
    setFormErrors({})
    setEditDialogOpen(true)
  }

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      num_samples: 1000,
      num_classes: 10,
      feature_dim: 784
    })
    setFormErrors({})
  }

  const openCreateDialog = () => {
    resetForm()
    setCreateDialogOpen(true)
  }

  const FormContent = () => (
    <>
      <TextField
        autoFocus
        margin="dense"
        label="数据集名称"
        fullWidth
        value={formData.name}
        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
        error={!!formErrors.name}
        helperText={formErrors.name}
      />
      <TextField
        margin="dense"
        label="描述"
        fullWidth
        multiline
        rows={3}
        value={formData.description}
        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
      />
      <Grid container spacing={2} sx={{ mt: 1 }}>
        <Grid item xs={4}>
          <TextField
            margin="dense"
            label="样本总数"
            type="number"
            fullWidth
            value={formData.num_samples}
            onChange={(e) => setFormData({ ...formData, num_samples: parseInt(e.target.value) || 0 })}
            error={!!formErrors.num_samples}
            helperText={formErrors.num_samples}
            InputProps={{ inputProps: { min: 1 } }}
          />
        </Grid>
        <Grid item xs={4}>
          <TextField
            margin="dense"
            label="类别数"
            type="number"
            fullWidth
            value={formData.num_classes}
            onChange={(e) => setFormData({ ...formData, num_classes: parseInt(e.target.value) || 0 })}
            error={!!formErrors.num_classes}
            helperText={formErrors.num_classes}
            InputProps={{ inputProps: { min: 1 } }}
          />
        </Grid>
        <Grid item xs={4}>
          <TextField
            margin="dense"
            label="特征维度"
            type="number"
            fullWidth
            value={formData.feature_dim}
            onChange={(e) => setFormData({ ...formData, feature_dim: parseInt(e.target.value) || 0 })}
            error={!!formErrors.feature_dim}
            helperText={formErrors.feature_dim}
            InputProps={{ inputProps: { min: 1 } }}
          />
        </Grid>
      </Grid>
    </>
  )

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 600 }}>
            数据集管理
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            共 {total} 个数据集
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={openCreateDialog}
        >
          新建数据集
        </Button>
      </Box>

      {loading ? (
        <Typography color="text.secondary">加载中...</Typography>
      ) : datasets.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <DatasetIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }} />
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            暂无数据集
          </Typography>
          <Button variant="outlined" startIcon={<AddIcon />} onClick={openCreateDialog}>
            创建第一个数据集
          </Button>
        </Box>
      ) : (
        <Grid container spacing={3}>
          {datasets.map((dataset) => (
            <Grid item xs={12} sm={6} md={4} lg={3} key={dataset.id}>
              <Card
                sx={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  transition: 'all 0.2s',
                  '&:hover': {
                    boxShadow: 3,
                    transform: 'translateY(-2px)'
                  }
                }}
              >
                <CardActionArea
                  onClick={() => navigate(`/datasets/${dataset.id}`)}
                  sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}
                >
                  <CardContent sx={{ flexGrow: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 2 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <DatasetIcon color="primary" />
                        <Typography variant="h6" sx={{ fontWeight: 600 }}>
                          {dataset.name}
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <Tooltip title="编辑">
                          <IconButton
                            size="small"
                            onClick={(e) => openEditDialog(dataset, e)}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="删除">
                          <IconButton
                            size="small"
                            color="error"
                            onClick={(e) => handleDelete(dataset.id, e)}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </Box>

                    {dataset.description && (
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ mb: 2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                      >
                        {dataset.description}
                      </Typography>
                    )}

                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
                      <Chip
                        label={`${dataset.num_samples} 样本`}
                        size="small"
                        variant="outlined"
                      />
                      <Chip
                        label={`${dataset.num_classes} 类别`}
                        size="small"
                        variant="outlined"
                      />
                      <Chip
                        label={`${dataset.feature_dim} 维`}
                        size="small"
                        variant="outlined"
                      />
                    </Box>

                    <Typography variant="caption" color="text.secondary">
                      创建于 {format(new Date(dataset.created_at), 'yyyy-MM-dd HH:mm', { locale: zhCN })}
                    </Typography>
                  </CardContent>
                </CardActionArea>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      <Dialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>新建数据集</DialogTitle>
        <DialogContent>
          <FormContent />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)}>取消</Button>
          <Button onClick={handleCreate} variant="contained">创建</Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={editDialogOpen}
        onClose={() => { setEditDialogOpen(false); setEditingDataset(null); }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>编辑数据集</DialogTitle>
        <DialogContent>
          <FormContent />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setEditDialogOpen(false); setEditingDataset(null); }}>取消</Button>
          <Button onClick={handleEdit} variant="contained">保存</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snackbar.open} autoHideDuration={3000} onClose={handleCloseSnackbar}>
        <Alert onClose={handleCloseSnackbar} severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  )
}
