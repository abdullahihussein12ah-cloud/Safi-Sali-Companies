import React, { useState, useEffect, useRef } from 'react';
import {
  Layers,
  Plus,
  Tag,
  Edit2,
  Trash2,
  X,
  AlertTriangle,
  Image as ImageIcon,
  Search,
  Eye,
  ChevronDown,
  Download,
  CheckSquare,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { AppStore } from '../../services/store';
import { ProductThumbnail } from './ProductThumbnail';
import { BrandRecord, CategoryRecord, Product } from '../../types';
import { exportToExcel } from '../../utils/exports';

export const CategoriesPage: React.FC = () => {
  const { showToast, t } = useApp();
  const [categories, setCategories] = useState<string[]>([]);
  const [categoryRecords, setCategoryRecords] = useState<CategoryRecord[]>(AppStore.getCategoryRecords());
  const [products, setProducts] = useState(AppStore.getProductsForManagement());
  const [brands, setBrands] = useState<BrandRecord[]>(AppStore.getBrandRecords());
  const [isAddCategoryModalOpen, setIsAddCategoryModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryDescription, setNewCategoryDescription] = useState('');
  const [newCategoryImage, setNewCategoryImage] = useState('');

  // Edit Category Modal
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editCategoryName, setEditCategoryName] = useState<string>('');
  const [editCategoryDescription, setEditCategoryDescription] = useState('');
  const [editCategoryImage, setEditCategoryImage] = useState('');
  const [brandModalOpen, setBrandModalOpen] = useState(false);
  const [editingBrand, setEditingBrand] = useState<BrandRecord | null>(null);
  const [brandName, setBrandName] = useState('');
  const [brandCode, setBrandCode] = useState('');
  const [brandDescription, setBrandDescription] = useState('');
  const [brandImage, setBrandImage] = useState('');
  const [brandManufacturer, setBrandManufacturer] = useState('');
  const [brandWebsite, setBrandWebsite] = useState('');
  const [brandContactInformation, setBrandContactInformation] = useState('');
  const [brandStatus, setBrandStatus] = useState<'active' | 'inactive'>('active');
  const [categoryCode, setCategoryCode] = useState('');
  const [categoryParentId, setCategoryParentId] = useState('');
  const [categoryStatus, setCategoryStatus] = useState<'active' | 'inactive'>('active');
  const [editCategoryCode, setEditCategoryCode] = useState('');
  const [editCategoryParentId, setEditCategoryParentId] = useState('');
  const [editCategoryStatus, setEditCategoryStatus] = useState<'active' | 'inactive'>('active');

  const [searchQuery, setSearchQuery] = useState('');
  const [categoryStatusFilter, setCategoryStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [brandStatusFilter, setBrandStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [parentCategoryFilter, setParentCategoryFilter] = useState('all');
  const [categorySort, setCategorySort] = useState<'name' | 'date' | 'products'>('name');
  const [brandSort, setBrandSort] = useState<'name' | 'date' | 'products'>('name');
  const [catalogTab, setCatalogTab] = useState<'categories' | 'brands'>('categories');
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [selectedBrandIds, setSelectedBrandIds] = useState<string[]>([]);
  const [viewingCategory, setViewingCategory] = useState<CategoryRecord | null>(null);
  const [viewingBrand, setViewingBrand] = useState<BrandRecord | null>(null);
  const [categoryToDelete, setCategoryToDelete] = useState<CategoryRecord | null>(null);
  const [brandToDelete, setBrandToDelete] = useState<BrandRecord | null>(null);
  const [deleteReplacementId, setDeleteReplacementId] = useState('');
  const [isDeletingCategory, setIsDeletingCategory] = useState(false);
  const [isBulkDeletingCategories, setIsBulkDeletingCategories] = useState(false);
  const [isBulkDeleteCategoriesOpen, setIsBulkDeleteCategoriesOpen] = useState(false);
  const [bulkDeleteCategoryReplacementId, setBulkDeleteCategoryReplacementId] = useState('');
  const [deletingBrandId, setDeletingBrandId] = useState<string | null>(null);
  const [categoryPage, setCategoryPage] = useState(1);
  const [brandPage, setBrandPage] = useState(1);
  const [bulkAssignmentOpen, setBulkAssignmentOpen] = useState(false);
  const [bulkTargetId, setBulkTargetId] = useState('');
  const [bulkProductIds, setBulkProductIds] = useState<string[]>([]);
  const [csvImportPreview, setCsvImportPreview] = useState<{
    type: 'categories' | 'brands';
    records: Array<{ name: string; code: string; description: string; image: string; manufacturer: string; status: 'active' | 'inactive' }>;
    errors: string[];
  } | null>(null);

  const categoryImageInputRef = useRef<HTMLInputElement>(null);
  const brandFileInputRef = useRef<HTMLInputElement>(null);
  const catalogCsvInputRef = useRef<HTMLInputElement>(null);

  const reloadData = () => {
    setCategories(AppStore.getCategories());
    setCategoryRecords(AppStore.getCategoryRecords());
    setProducts(AppStore.getProductsForManagement());
    setBrands(AppStore.getBrandRecords());
  };

  useEffect(() => {
    reloadData();
    return AppStore.subscribe(reloadData);
  }, []);

  const categoryStats: Record<string, { count: number; totalValue: number }> = {};
  const brandStats: Record<string, number> = {};

  products.forEach((p) => {
    if (p.category) {
      if (!categoryStats[p.category]) {
        categoryStats[p.category] = { count: 0, totalValue: 0 };
      }
      categoryStats[p.category].count += 1;
      categoryStats[p.category].totalValue += p.stock * p.sellingPrice;
    }

    const b = p.brand || 'Generic';
    brandStats[b] = (brandStats[b] || 0) + 1;
  });

  categories.forEach((cat) => {
    if (!categoryStats[cat]) {
      categoryStats[cat] = { count: 0, totalValue: 0 };
    }
  });

  const normalizedSearch = searchQuery.trim().toLocaleLowerCase();
  const filteredCategoryRecords = categoryRecords.filter((record) => {
    const matchesSearch = !normalizedSearch ||
      record.name.toLocaleLowerCase().includes(normalizedSearch) ||
      record.code.toLocaleLowerCase().includes(normalizedSearch);
    const matchesStatus = categoryStatusFilter === 'all' || record.status === categoryStatusFilter;
    const matchesParent = parentCategoryFilter === 'all' ||
      (parentCategoryFilter === 'root' ? !record.parentCategoryId : record.parentCategoryId === parentCategoryFilter);
    return matchesSearch && matchesStatus && matchesParent;
  }).sort((left, right) => categorySort === 'date'
    ? right.createdAt.localeCompare(left.createdAt)
    : categorySort === 'products'
      ? (categoryStats[right.name]?.count || 0) - (categoryStats[left.name]?.count || 0)
      : left.name.localeCompare(right.name));
  const filteredBrands = brands.filter((brand) => {
    const matchesSearch = !normalizedSearch ||
      brand.name.toLocaleLowerCase().includes(normalizedSearch) ||
      (brand.code || '').toLocaleLowerCase().includes(normalizedSearch);
    return matchesSearch && (brandStatusFilter === 'all' || (brand.status || 'active') === brandStatusFilter);
  }).sort((left, right) => brandSort === 'date'
    ? (right.createdAt || '').localeCompare(left.createdAt || '')
    : brandSort === 'products'
      ? (brandStats[right.name] || 0) - (brandStats[left.name] || 0)
      : left.name.localeCompare(right.name));
  const pageSize = 10;
  const pagedCategories = filteredCategoryRecords.slice((categoryPage - 1) * pageSize, categoryPage * pageSize);
  const pagedBrands = filteredBrands.slice((brandPage - 1) * pageSize, brandPage * pageSize);
  const activeCategoryCount = categoryRecords.filter((record) => record.status === 'active').length;
  const activeBrandCount = brands.filter((brand) => (brand.status || 'active') === 'active').length;
  const productsWithoutCategory = products.filter((product) => !product.categoryId && !product.category).length;
  const productsWithoutBrand = products.filter((product) => !product.brandId && (!product.brand || product.brand === 'Generic')).length;

  const toggleCatalogStatus = (recordId: string, type: 'category' | 'brand', status: 'active' | 'inactive'): boolean => {
    try {
      if (type === 'category') {
        const record = categoryRecords.find((item) => item.id === recordId);
        if (!record) return false;
        AppStore.updateCategory(record.name, record.name, record.description, record.image, {
          code: record.code,
          parentCategoryId: record.parentCategoryId,
          status,
        });
      } else {
        const brand = brands.find((item) => item.id === recordId);
        if (!brand) return false;
        AppStore.updateBrand(brand.id, brand.name, brand.description, brand.image, { ...brand, status });
      }
      reloadData();
      return true;
    } catch (error) {
      showToast(error instanceof Error ? error.message : t('catalogSaveError'), 'error');
      return false;
    }
  };

  const exportCatalog = (type: 'category' | 'brand') => {
    const rows = type === 'category'
      ? filteredCategoryRecords.map((record) => [
          record.name, record.code, record.description, record.parentCategoryId,
          record.status, categoryStats[record.name]?.count || 0, record.createdAt,
        ])
      : filteredBrands.map((record) => [
          record.name, record.code || '', record.description, record.manufacturer || '',
          record.website || '', record.contactInformation || '', record.status || 'active',
          brandStats[record.name] || 0, record.createdAt,
        ]);
    const headers = type === 'category'
      ? ['Name', 'Code', 'Description', 'Parent ID', 'Status', 'Products', 'Created At']
      : ['Name', 'Code', 'Description', 'Manufacturer', 'Website', 'Contact', 'Status', 'Products', 'Created At'];
    exportToExcel(`Safi_Sali_${type === 'category' ? 'Categories' : 'Brands'}`, headers, rows);
  };

  const exportCatalogPdf = () => window.print();

  const handleAddCategory = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newCategoryName.trim();
    if (!clean) {
      showToast(t('categoryNameEmpty'), 'error');
      return;
    }
    try {
      const ok = AppStore.addCategory(clean, newCategoryDescription, newCategoryImage, {
        code: categoryCode.trim() || `CAT-${clean.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 36)}`,
        parentCategoryId: categoryParentId,
        status: categoryStatus,
      });
      if (!ok) {
        showToast(t('categoryAlreadyExists').replace('{name}', clean), 'info');
        return;
      }
      showToast(t('categoryAdded').replace('{name}', clean), 'success');
      setNewCategoryName('');
      setNewCategoryDescription('');
      setNewCategoryImage('');
      setCategoryCode('');
      setCategoryParentId('');
      setCategoryStatus('active');
      setIsAddCategoryModalOpen(false);
      reloadData();
    } catch (error) {
      showToast(error instanceof Error ? error.message : t('categoryAlreadyExists').replace('{name}', clean), 'error');
    }
  };

  const openEditModal = (cat: string) => {
    setEditingCategory(cat);
    setEditCategoryName(cat);
    setEditCategoryDescription(AppStore.getCategoryDescription(cat));
    setEditCategoryImage(AppStore.getCategoryImage(cat));
    const record = AppStore.getCategoryRecordByName(cat);
    setEditCategoryCode(record?.code || '');
    setEditCategoryParentId(record?.parentCategoryId || '');
    setEditCategoryStatus(record?.status || 'active');
  };

  const handleSaveEditCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCategory) return;
    const cleanNew = editCategoryName.trim();
    if (!cleanNew) {
      showToast(t('categoryNameEmpty'), 'error');
      return;
    }
    if (categories.some((category) => category.toLowerCase() === cleanNew.toLowerCase() && category.toLowerCase() !== editingCategory.toLowerCase())) {
      showToast(t('categoryAlreadyExists').replace('{name}', cleanNew), 'info');
      return;
    }
    try {
      const ok = AppStore.updateCategory(editingCategory, cleanNew, editCategoryDescription, editCategoryImage, {
        code: editCategoryCode.trim(),
        parentCategoryId: editCategoryParentId,
        status: editCategoryStatus,
      });
      if (!ok) {
        showToast(t('categoryAlreadyExists').replace('{name}', cleanNew), 'error');
        return;
      }
      showToast(t('categoryUpdated').replace('{name}', cleanNew), 'success');
      setEditingCategory(null);
      reloadData();
    } catch (error) {
      showToast(error instanceof Error ? error.message : t('categoryAlreadyExists').replace('{name}', cleanNew), 'error');
    }
  };

  const readImageFile = (file: File, onLoaded: (value: string) => void) => {
    if (!file.type.startsWith('image/')) {
      showToast(t('chooseValidImage'), 'error');
      return;
    }
    if (file.size > 1_800_000) {
      showToast(t('imageTooLarge'), 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') onLoaded(reader.result);
      else showToast(t('imageReadError'), 'error');
    };
    reader.onerror = () => showToast(t('imageReadError'), 'error');
    reader.readAsDataURL(file);
  };

  const openNewBrand = () => {
    setEditingBrand(null);
    setBrandName('');
    setBrandCode('');
    setBrandDescription('');
    setBrandImage('');
    setBrandManufacturer('');
    setBrandWebsite('');
    setBrandContactInformation('');
    setBrandStatus('active');
    setBrandModalOpen(true);
  };

  const openEditBrand = (brand: BrandRecord) => {
    setEditingBrand(brand);
    setBrandName(brand.name);
    setBrandCode(brand.code || '');
    setBrandDescription(brand.description);
    setBrandImage(brand.image);
    setBrandManufacturer(brand.manufacturer || '');
    setBrandWebsite(brand.website || '');
    setBrandContactInformation(brand.contactInformation || '');
    setBrandStatus(brand.status || 'active');
    setBrandModalOpen(true);
  };

  const handleSaveBrand = (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const details = {
        code: brandCode.trim() || `BR-${brandName.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 36)}`,
        manufacturer: brandManufacturer,
        website: brandWebsite,
        contactInformation: brandContactInformation,
        status: brandStatus,
      };
      if (editingBrand) AppStore.updateBrand(editingBrand.id, brandName, brandDescription, brandImage, details);
      else AppStore.addBrand(brandName, brandDescription, brandImage, details);
      setBrandModalOpen(false);
      reloadData();
      showToast(editingBrand ? t('brandUpdated') : t('brandAdded'), 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not save this brand.', 'error');
    }
  };

  const handleDeleteBrand = async (brand: BrandRecord) => {
    if (deletingBrandId) return;
    setDeletingBrandId(brand.id);
    setBrands((current) => current.filter((item) => item.id !== brand.id));
    setProducts((current) => current.map((product) => (
      product.brand?.toLocaleLowerCase() === brand.name.toLocaleLowerCase()
        ? { ...product, brand: 'Generic' }
        : product
    )));
    try {
      await AppStore.deleteBrand(brand.id);
      reloadData();
      showToast(t('brandDeleted').replace('{name}', brand.name), 'success');
    } catch (error) {
      reloadData();
      showToast(error instanceof Error ? error.message : 'Could not delete this brand.', 'error');
    } finally {
      setDeletingBrandId(null);
    }
  };

  const openDeleteCategory = (categoryName: string) => {
    const record = AppStore.getCategoryRecordByName(categoryName);
    if (!record) {
      showToast(t('categoryNotFound'), 'error');
      return;
    }
    setCategoryToDelete(record);
    setDeleteReplacementId('');
  };

  const handleDeleteCategory = async () => {
    if (!categoryToDelete || isDeletingCategory) return;
    const categoryName = categoryToDelete.name;
    const replacementCategory = categoryRecords.find((record) => record.id === deleteReplacementId)?.name || '';
    const assignedProducts = products.filter((product) =>
      product.categoryId === categoryToDelete.id || product.category?.toLocaleLowerCase() === categoryName.toLocaleLowerCase()
    );
    if (assignedProducts.length > 0 && !replacementCategory) {
      showToast(t('chooseReplacementCategory'), 'error');
      return;
    }
    const oldCategories = categories;
    const oldProducts = products;
    setIsDeletingCategory(true);
    setCategories((current) => current.filter((category) => category.toLowerCase() !== categoryName.toLowerCase()));
    setProducts((current) => current.map((product) => (
    product.categoryId === categoryToDelete.id || product.category?.toLowerCase() === categoryName.toLowerCase()
        ? {
            ...product,
            category: replacementCategory,
            categoryId: replacementCategory ? deleteReplacementId : undefined,
          }
        : product
    )));
    try {
      await AppStore.deleteCategory(categoryName, replacementCategory || undefined);
      showToast(t('categoryDeleted').replace('{name}', categoryName), 'success');
      setCategoryToDelete(null);
      reloadData();
    } catch (error) {
      setCategories(oldCategories);
      setProducts(oldProducts);
      showToast(error instanceof Error ? error.message : 'Failed to move category to the Recycling Bin.', 'error');
    } finally {
      setIsDeletingCategory(false);
    }
  };

  const handleBulkDeleteCategories = async () => {
    if (isBulkDeletingCategories) return;
    const recordsToDelete = categoryRecords.filter((record) => selectedCategoryIds.includes(record.id));
    if (recordsToDelete.length === 0) {
      showToast(t('selectCategoriesToDelete'), 'error');
      return;
    }

    const selectedIds = new Set(recordsToDelete.map((record) => record.id));
    const assignedProductsExist = products.some((product) =>
      recordsToDelete.some((record) =>
        product.categoryId === record.id || product.category?.toLocaleLowerCase() === record.name.toLocaleLowerCase()
      )
    );
    const replacement = categoryRecords.find((record) => record.id === bulkDeleteCategoryReplacementId);
    if (assignedProductsExist && (!replacement || selectedIds.has(replacement.id) || replacement.status !== 'active')) {
      showToast(t('chooseReplacementCategory'), 'error');
      return;
    }

    setIsBulkDeletingCategories(true);
    let deletedCount = 0;
    let failure: unknown;
    for (const record of recordsToDelete) {
      try {
        await AppStore.deleteCategory(record.name, assignedProductsExist ? replacement?.name : undefined);
        deletedCount += 1;
      } catch (error) {
        failure = error;
        break;
      }
    }
    reloadData();
    setSelectedCategoryIds((current) => current.filter((id) => !recordsToDelete.slice(0, deletedCount).some((record) => record.id === id)));
    setIsBulkDeletingCategories(false);
    if (deletedCount === recordsToDelete.length) {
      showToast(t('bulkCategoriesDeleted').replace('{count}', String(deletedCount)), 'success');
      setIsBulkDeleteCategoriesOpen(false);
      setBulkDeleteCategoryReplacementId('');
    } else {
      showToast(
        t('bulkCategoriesDeletePartial').replace('{count}', String(deletedCount)).replace(
          '{error}',
          failure instanceof Error ? failure.message : t('catalogSaveError')
        ),
        deletedCount > 0 ? 'info' : 'error'
      );
    }
  };

  const confirmDeleteBrand = async () => {
    if (!brandToDelete) return;
    const brand = brandToDelete;
    setBrandToDelete(null);
    await handleDeleteBrand(brand);
  };

  const handleCatalogCsvImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const content = String(reader.result || '').replace(/^\uFEFF/, '');
        const [headerLine, ...lines] = content.split(/\r?\n/).filter((line) => line.trim());
        if (!headerLine) throw new Error(t('catalogCsvMissingHeader'));
        const splitCsv = (line: string) => {
          const columns: string[] = [];
          let current = '';
          let quoted = false;
          for (let index = 0; index < line.length; index += 1) {
            const char = line[index];
            if (char === '"' && line[index + 1] === '"') { current += '"'; index += 1; }
            else if (char === '"') quoted = !quoted;
            else if (char === ',' && !quoted) { columns.push(current.trim()); current = ''; }
            else current += char;
          }
          columns.push(current.trim());
          return columns;
        };
        const headers = splitCsv(headerLine).map((header) => header.toLocaleLowerCase().replace(/[\s-]+/g, '_'));
        const nameIndex = headers.findIndex((header) => ['name', 'category_name', 'brand_name'].includes(header));
        if (nameIndex < 0) throw new Error(t('catalogCsvMissingName'));
        const importType = catalogTab;
        const errors: string[] = [];
        const records: Array<{ name: string; code: string; description: string; image: string; manufacturer: string; status: 'active' | 'inactive' }> = [];
        const existingNames = new Set((importType === 'categories' ? categoryRecords : brands).map((record) => record.name.toLocaleLowerCase()));
        const existingCodes = new Set((importType === 'categories' ? categoryRecords : brands).map((record) => (record.code || '').toLocaleLowerCase()).filter(Boolean));
        const incomingNames = new Set<string>();
        const incomingCodes = new Set<string>();
        lines.forEach((line, index) => {
          const values = splitCsv(line);
          const name = values[nameIndex] || '';
          const code = values[headers.findIndex((header) => ['code', 'category_code', 'brand_code'].includes(header))] || '';
          const description = values[headers.indexOf('description')] || '';
          const image = values[headers.findIndex((header) => ['image', 'category_image', 'logo'].includes(header))] || '';
          const normalizedName = name.trim().toLocaleLowerCase();
          const normalizedCode = code.trim().toLocaleLowerCase();
          if (!name.trim() || name.trim().length > 120) {
            errors.push(`${index + 2}: ${t('categoryNameRequired')}`);
            return;
          }
          if (existingNames.has(normalizedName) || incomingNames.has(normalizedName)) {
            errors.push(`${index + 2}: ${name} — ${t('duplicateCatalogName')}`);
            return;
          }
          if (normalizedCode && (existingCodes.has(normalizedCode) || incomingCodes.has(normalizedCode))) {
            errors.push(`${index + 2}: ${code} — ${t('duplicateCatalogCode')}`);
            return;
          }
          if (code.length > 50 || description.length > 1000 || image.length > 2_500_000) {
            errors.push(`${index + 2}: ${t('catalogImportFieldLimit')}`);
            return;
          }
          if (image && !image.startsWith('data:image/') && !/^https?:\/\//i.test(image)) {
            errors.push(`${index + 2}: ${t('catalogImportInvalidImage')}`);
            return;
          }
          const statusValue = values[headers.indexOf('status')]?.toLocaleLowerCase();
          records.push({
            name: name.trim(),
            code: code.trim(),
            description,
            image,
            manufacturer: values[headers.indexOf('manufacturer')] || '',
            status: statusValue === 'inactive' ? 'inactive' : 'active',
          });
          incomingNames.add(normalizedName);
          if (normalizedCode) incomingCodes.add(normalizedCode);
        });
        setCsvImportPreview({ type: importType, records, errors });
      } catch (error) {
        showToast(error instanceof Error ? error.message : t('catalogImportError'), 'error');
      }
    };
    reader.onerror = () => showToast(t('catalogImportError'), 'error');
    reader.readAsText(file);
    event.target.value = '';
  };

  const commitCatalogCsvImport = () => {
    if (!csvImportPreview) return;
    let added = 0;
    const errors = [...csvImportPreview.errors];
    csvImportPreview.records.forEach((record) => {
      try {
        if (csvImportPreview.type === 'categories') {
          if (AppStore.addCategory(record.name, record.description, record.image, {
            code: record.code || undefined,
            status: record.status,
          })) added += 1;
          else errors.push(`${record.name}: ${t('duplicateCatalogName')}`);
        } else {
          AppStore.addBrand(record.name, record.description, record.image, {
            code: record.code || undefined,
            manufacturer: record.manufacturer,
            status: record.status,
          });
          added += 1;
        }
      } catch (error) {
        errors.push(`${record.name}: ${error instanceof Error ? error.message : t('catalogImportError')}`);
      }
    });
    reloadData();
    showToast(
      t('catalogImportSummary').replace('{count}', String(added)).replace('{errors}', String(errors.length)),
      errors.length ? 'info' : 'success'
    );
    setCsvImportPreview(null);
  };

  const handleBulkStatus = (type: 'category' | 'brand', status: 'active' | 'inactive') => {
    const ids = type === 'category' ? selectedCategoryIds : selectedBrandIds;
    let updated = 0;
    ids.forEach((id) => { if (toggleCatalogStatus(id, type, status)) updated += 1; });
    if (type === 'category') setSelectedCategoryIds([]);
    else setSelectedBrandIds([]);
    showToast(t('catalogBulkUpdated').replace('{count}', String(updated)), updated === ids.length ? 'success' : 'info');
  };

  const handleBulkProductAssignment = () => {
    if (bulkProductIds.length === 0 || !bulkTargetId) {
      showToast(t('selectProductsAndTarget'), 'error');
      return;
    }
    try {
      const count = catalogTab === 'categories'
        ? AppStore.assignProductsToCategory(bulkProductIds, bulkTargetId)
        : AppStore.assignProductsToBrand(bulkProductIds, bulkTargetId);
      setBulkAssignmentOpen(false);
      setBulkProductIds([]);
      setBulkTargetId('');
      reloadData();
      showToast(t('catalogProductsAssigned').replace('{count}', String(count)), 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : t('catalogSaveError'), 'error');
    }
  };

  const openAddCategory = () => {
    setNewCategoryName('');
    setCategoryCode('');
    setNewCategoryDescription('');
    setNewCategoryImage('');
    setCategoryParentId('');
    setCategoryStatus('active');
    setIsAddCategoryModalOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            {t('categoriesBrandsTitle')}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {t('categoriesBrandsDescription')}
          </p>
        </div>

      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          [t('totalCategories'), categoryRecords.length],
          [t('activeCategories'), activeCategoryCount],
          [t('inactiveCategories'), categoryRecords.length - activeCategoryCount],
          [t('totalBrands'), brands.length],
          [t('activeBrands'), activeBrandCount],
          [t('inactiveBrands'), brands.length - activeBrandCount],
          [t('totalProducts'), products.length],
          [t('productsWithoutCategories'), productsWithoutCategory],
          [t('productsWithoutBrands'), productsWithoutBrand],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-1 text-xl font-extrabold text-slate-900 dark:text-white">{value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center">
        <div className="flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
          {(['categories', 'brands'] as const).map((tab) => (
            <button key={tab} type="button" onClick={() => setCatalogTab(tab)} className={`rounded-lg px-4 py-2 text-xs font-bold capitalize ${catalogTab === tab ? 'bg-white text-emerald-700 shadow-sm dark:bg-slate-700 dark:text-emerald-300' : 'text-slate-500'}`}>
              {tab === 'categories' ? t('categories') : t('brands')}
            </button>
          ))}
        </div>
        <label className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={searchQuery} onChange={(event) => { setSearchQuery(event.target.value); setCategoryPage(1); setBrandPage(1); }} placeholder={t('searchCategoriesBrands')} className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs dark:border-slate-700 dark:bg-slate-800" />
        </label>
        <input ref={catalogCsvInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleCatalogCsvImport} />
        <button type="button" onClick={() => catalogCsvInputRef.current?.click()} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold dark:border-slate-700">{t('importCsv')}</button>
        <button type="button" onClick={() => exportCatalog(catalogTab === 'categories' ? 'category' : 'brand')} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold dark:border-slate-700"><Download className="mr-1 inline h-3.5 w-3.5" />{t('exportExcel')}</button>
        <button type="button" onClick={exportCatalogPdf} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold dark:border-slate-700">{t('exportPdf')}</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Categories Section (2 cols) */}
        <div className={`space-y-4 ${catalogTab === 'categories' ? 'lg:col-span-2' : 'hidden'}`}>
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white">{t('activeProductCategories')}</h3>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400 font-mono">{filteredCategoryRecords.length} {t('categoriesCount')}</span>
              <button
                type="button"
                onClick={openAddCategory}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-500 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                {t('add')}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select value={categoryStatusFilter} onChange={(event) => { setCategoryStatusFilter(event.target.value as typeof categoryStatusFilter); setCategoryPage(1); }} className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs dark:border-slate-700 dark:bg-slate-900">
              <option value="all">{t('allStatuses')}</option><option value="active">{t('active')}</option><option value="inactive">{t('inactive')}</option>
            </select>
            <select value={parentCategoryFilter} onChange={(event) => { setParentCategoryFilter(event.target.value); setCategoryPage(1); }} className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs dark:border-slate-700 dark:bg-slate-900">
              <option value="all">{t('allParentCategories')}</option><option value="root">{t('rootCategories')}</option>
              {categoryRecords.map((record) => <option key={record.id} value={record.id}>{record.name}</option>)}
            </select>
            <select value={categorySort} onChange={(event) => setCategorySort(event.target.value as typeof categorySort)} className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs dark:border-slate-700 dark:bg-slate-900">
              <option value="name">{t('sortByName')}</option><option value="date">{t('sortByDate')}</option><option value="products">{t('sortByProductCount')}</option>
            </select>
            <button type="button" onClick={() => { setBulkProductIds([]); setBulkTargetId(''); setBulkAssignmentOpen(true); }} className="rounded-lg border border-emerald-200 px-3 py-2 text-xs font-bold text-emerald-700 dark:border-emerald-900 dark:text-emerald-300">{t('bulkAssignProducts')}</button>
            {selectedCategoryIds.length > 0 && <>
              <button type="button" onClick={() => handleBulkStatus('category', 'active')} className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">{t('bulkActivate')}</button>
              <button type="button" onClick={() => handleBulkStatus('category', 'inactive')} className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">{t('bulkDeactivate')}</button>
              <button type="button" onClick={() => { setBulkDeleteCategoryReplacementId(''); setIsBulkDeleteCategoriesOpen(true); }} className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{t('deleteSelectedCategories').replace('{count}', String(selectedCategoryIds.length))}</button>
            </>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {pagedCategories.map((record) => {
              const cat = record.name;
              const stats = categoryStats[cat] || { count: 0, totalValue: 0 };
              const categoryProduct = products.find((product) => product.category === cat);
              const categoryImage = AppStore.getCategoryImage(cat);
              return (
                <div
                  key={cat}
                  className="overflow-hidden bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-xs hover:border-emerald-500/40 transition group"
                >
                  {categoryImage ? (
                    <img src={categoryImage} alt={cat} className="h-36 w-full object-cover" />
                  ) : (
                    <ProductThumbnail
                      src={categoryProduct?.image}
                      alt={cat}
                      className="h-36 w-full rounded-none"
                      productName={categoryProduct?.name || cat}
                      category={cat}
                      brand={categoryProduct?.brand}
                    />
                  )}
                  <div className="p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <input type="checkbox" aria-label={`${t('select')} ${cat}`} checked={selectedCategoryIds.includes(record.id)} onChange={(event) => setSelectedCategoryIds((current) => event.target.checked ? [...current, record.id] : current.filter((id) => id !== record.id))} className="mr-1 accent-emerald-600" />
                        <button type="button" onClick={() => setViewingCategory(record)} aria-label={`${t('view')} ${cat}`} className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-[11px] font-semibold text-sky-600 hover:bg-sky-50 dark:text-sky-400"><Eye className="h-3.5 w-3.5" />{t('view')}</button>
                        <button type="button"
                          onClick={() => openEditModal(cat)}
                          aria-label={`Edit ${cat}`}
                          className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-[11px] font-semibold text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/60 transition cursor-pointer"
                          title={`Edit ${cat}`}
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          <span>{t('edit')}</span>
                        </button>
                        <button
                          type="button"
                          disabled={isDeletingCategory}
                          onClick={() => openDeleteCategory(cat)}
                          aria-label={`Delete ${cat}`}
                          className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-[11px] font-semibold text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/60 transition cursor-pointer disabled:cursor-wait disabled:opacity-50"
                          title={`Delete ${cat}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>{t('delete')}</span>
                        </button>
                        <span
                          aria-label={`${stats.count} products`}
                          className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 ml-1"
                        >
                          {stats.count}
                        </span>
                      </div>
                      <button type="button" onClick={() => toggleCatalogStatus(record.id, 'category', record.status === 'active' ? 'inactive' : 'active')} className={`rounded-full px-2 py-1 text-[9px] font-bold ${record.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>{record.status}</button>
                    </div>

                  <div className="font-bold text-sm text-slate-900 dark:text-white">
                    {cat}
                  </div>
                  {AppStore.getCategoryDescription(cat) && (
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {AppStore.getCategoryDescription(cat)}
                    </p>
                  )}
                  <div className="text-xs text-slate-400 mt-1 flex items-center justify-between">
                    <span>{t('retailValue')}</span>
                    <span className="font-semibold text-emerald-600 font-mono">
                      {AppStore.formatMoney(stats.totalValue)}
                    </span>
                  </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>{filteredCategoryRecords.length} {t('categoriesCount')}</span>
            <div className="flex gap-2">
              <button type="button" disabled={categoryPage <= 1} onClick={() => setCategoryPage((page) => page - 1)} className="rounded-lg border px-3 py-1.5 disabled:opacity-40">{t('previous')}</button>
              <span className="py-1.5">{categoryPage} / {Math.max(1, Math.ceil(filteredCategoryRecords.length / pageSize))}</span>
              <button type="button" disabled={categoryPage >= Math.ceil(filteredCategoryRecords.length / pageSize)} onClick={() => setCategoryPage((page) => page + 1)} className="rounded-lg border px-3 py-1.5 disabled:opacity-40">{t('next')}</button>
            </div>
          </div>

        </div>

        {/* Sidebar: Brands */}
        <div className={`${catalogTab === 'brands' ? 'lg:col-span-3' : 'hidden'} bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-xs space-y-4`}>
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
              <Tag className="w-4 h-4 text-emerald-500" />
              <span>{t('manufacturerBrands')}</span>
            </h3>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-mono">{filteredBrands.length} {t('brandsCount')}</span>
              <button type="button" onClick={openNewBrand} className="inline-flex min-h-8 items-center gap-1 rounded-lg bg-emerald-600 px-2.5 text-[10px] font-bold text-white hover:bg-emerald-500">
                <Plus className="h-3.5 w-3.5" /> {t('addBrand')}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select value={brandStatusFilter} onChange={(event) => { setBrandStatusFilter(event.target.value as typeof brandStatusFilter); setBrandPage(1); }} className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs dark:border-slate-700 dark:bg-slate-900">
              <option value="all">{t('allStatuses')}</option><option value="active">{t('active')}</option><option value="inactive">{t('inactive')}</option>
            </select>
            <select value={brandSort} onChange={(event) => setBrandSort(event.target.value as typeof brandSort)} className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs dark:border-slate-700 dark:bg-slate-900">
              <option value="name">{t('sortByName')}</option><option value="date">{t('sortByDate')}</option><option value="products">{t('sortByProductCount')}</option>
            </select>
            <button type="button" onClick={() => { setBulkProductIds([]); setBulkTargetId(''); setBulkAssignmentOpen(true); }} className="rounded-lg border border-emerald-200 px-3 py-2 text-xs font-bold text-emerald-700 dark:border-emerald-900 dark:text-emerald-300">{t('bulkAssignProducts')}</button>
            {selectedBrandIds.length > 0 && <>
              <button type="button" onClick={() => handleBulkStatus('brand', 'active')} className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">{t('bulkActivate')}</button>
              <button type="button" onClick={() => handleBulkStatus('brand', 'inactive')} className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">{t('bulkDeactivate')}</button>
            </>}
          </div>

          <div className="space-y-2 max-h-96 overflow-y-auto">
            {pagedBrands.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-400">
                {t('noBrandsRecorded')}
              </div>
            ) : (
              pagedBrands.map((record) => (
                <div
                  key={record.id}
                  className="flex items-center justify-between p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 text-xs"
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <input type="checkbox" aria-label={`${t('select')} ${record.name}`} checked={selectedBrandIds.includes(record.id)} onChange={(event) => setSelectedBrandIds((current) => event.target.checked ? [...current, record.id] : current.filter((id) => id !== record.id))} className="accent-emerald-600" />
                    {(() => {
                      const brandProduct = products.find((product) => (product.brand || 'Generic') === record.name);
                      return (
                        record.image ? (
                          <img src={record.image} alt={`${record.name} logo`} className="h-10 w-10 rounded-lg border border-slate-200 object-contain bg-white" />
                        ) : (
                          <ProductThumbnail
                            src={brandProduct?.image}
                            alt={record.name}
                            className="h-10 w-10 rounded-lg"
                            productName={brandProduct?.name || record.name}
                            category={brandProduct?.category}
                            brand={record.name}
                          />
                        )
                      );
                    })()}
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-slate-800 dark:text-slate-200">{record.name}</span>
                      <span className="block truncate text-[9px] text-slate-500">{record.code} · {record.manufacturer || record.description}</span>
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <span className="text-[11px] font-mono text-slate-400 font-bold">{brandStats[record.name] || 0} {t('items')}</span>
                    <button type="button" onClick={() => setViewingBrand(record)} aria-label={`${t('view')} ${record.name}`} className="rounded-md p-1.5 text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-950/50"><Eye className="h-3.5 w-3.5" /></button>
                    <button type="button" onClick={() => openEditBrand(record)} aria-label={`Edit ${record.name}`} className="rounded-md p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/50"><Edit2 className="h-3.5 w-3.5" /></button>
                    <button type="button" onClick={() => toggleCatalogStatus(record.id, 'brand', record.status === 'active' ? 'inactive' : 'active')} className={`rounded-full px-2 py-1 text-[9px] font-bold ${record.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>{record.status}</button>
                    <button type="button" disabled={deletingBrandId !== null} onClick={() => setBrandToDelete(record)} aria-label={`Delete ${record.name}`} title={t('delete')} className="rounded-md p-1.5 text-rose-600 hover:bg-rose-50 disabled:cursor-wait disabled:opacity-50 dark:hover:bg-rose-950/50"><Trash2 className="h-3.5 w-3.5" /></button>
                  </span>
                </div>
              ))
            )}
          </div>
          <div className="flex items-center justify-end gap-2 text-xs text-slate-500">
            <button type="button" disabled={brandPage <= 1} onClick={() => setBrandPage((page) => page - 1)} className="rounded-lg border px-3 py-1.5 disabled:opacity-40">{t('previous')}</button>
            <span>{brandPage} / {Math.max(1, Math.ceil(filteredBrands.length / pageSize))}</span>
            <button type="button" disabled={brandPage >= Math.ceil(filteredBrands.length / pageSize)} onClick={() => setBrandPage((page) => page + 1)} className="rounded-lg border px-3 py-1.5 disabled:opacity-40">{t('next')}</button>
          </div>
        </div>
      </div>

      {/* Add Category Modal */}
      {isAddCategoryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">{t('addCategory')}</h3>
              <button
                type="button"
                onClick={() => setIsAddCategoryModalOpen(false)}
                aria-label="Close"
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddCategory} className="space-y-4 text-xs">
              <div>
                <label htmlFor="new-category-name" className="mb-1 block font-semibold text-slate-700 dark:text-slate-300">
                  Category Name <span className="text-rose-500">*</span>
                </label>
                <input
                  id="new-category-name"
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  required
                  autoFocus
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-medium text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label htmlFor="new-category-code" className="mb-1 block font-semibold">{t('categoryCode')}</label>
                  <input id="new-category-code" value={categoryCode} onChange={(event) => setCategoryCode(event.target.value)} maxLength={50} placeholder="CAT-001" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800" />
                </div>
                <div>
                  <label htmlFor="new-category-parent" className="mb-1 block font-semibold">{t('parentCategory')}</label>
                  <select id="new-category-parent" value={categoryParentId} onChange={(event) => setCategoryParentId(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
                    <option value="">{t('noneGeneral')}</option>
                    {categoryRecords.map((record) => <option key={record.id} value={record.id}>{record.name}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="new-category-status" className="mb-1 block font-semibold">{t('statusLabel')}</label>
                  <select id="new-category-status" value={categoryStatus} onChange={(event) => setCategoryStatus(event.target.value as typeof categoryStatus)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
                    <option value="active">{t('active')}</option><option value="inactive">{t('inactive')}</option>
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor="new-category-description" className="mb-1 block font-semibold text-slate-700 dark:text-slate-300">
                  Description
                </label>
                <textarea
                  id="new-category-description"
                  value={newCategoryDescription}
                  onChange={(e) => setNewCategoryDescription(e.target.value)}
                  rows={3}
                  className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>
              <div className="space-y-2">
                <label className="block font-semibold text-slate-700 dark:text-slate-300">{t('categoryImage')}</label>
                <input ref={categoryImageInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) readImageFile(file, setNewCategoryImage);
                  event.target.value = '';
                }} />
                <div className="flex items-center gap-3">
                  {newCategoryImage ? <img src={newCategoryImage} alt="Category preview" className="h-14 w-14 rounded-lg border object-cover" /> : <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-dashed text-slate-400"><ImageIcon className="h-5 w-5" /></div>}
                  <button type="button" onClick={() => categoryImageInputRef.current?.click()} className="rounded-lg border border-slate-200 px-3 py-2 font-semibold dark:border-slate-700">{t('uploadImage')}</button>
                  <input type="url" value={newCategoryImage.startsWith('data:') ? '' : newCategoryImage} onChange={(event) => setNewCategoryImage(event.target.value)} placeholder={t('pasteImageUrl')} className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700 dark:bg-slate-800" />
                </div>
              </div>
              <div className="flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddCategoryModalOpen(false);
                    setNewCategoryName('');
                    setNewCategoryDescription('');
                  }}
                  className="rounded-xl px-4 py-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-emerald-600 px-5 py-2.5 font-bold text-white hover:bg-emerald-500"
                >
                  Save Category
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Category Modal */}
      {editingCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">{t('editCategory')}</h3>
              <button onClick={() => setEditingCategory(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveEditCategory} className="space-y-4 text-xs">
              <div>
                <label htmlFor="edit-category-name" className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Category Name <span className="text-rose-500">*</span>
                </label>
                <input
                  id="edit-category-name"
                  type="text"
                  value={editCategoryName}
                  onChange={(e) => setEditCategoryName(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold"
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label htmlFor="edit-category-code" className="mb-1 block font-semibold">{t('categoryCode')}</label>
                  <input id="edit-category-code" value={editCategoryCode} onChange={(event) => setEditCategoryCode(event.target.value)} maxLength={50} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800" />
                </div>
                <div>
                  <label htmlFor="edit-category-parent" className="mb-1 block font-semibold">{t('parentCategory')}</label>
                  <select id="edit-category-parent" value={editCategoryParentId} onChange={(event) => setEditCategoryParentId(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
                    <option value="">{t('noneGeneral')}</option>
                    {categoryRecords.filter((record) => record.name !== editingCategory).map((record) => <option key={record.id} value={record.id}>{record.name}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="edit-category-status" className="mb-1 block font-semibold">{t('statusLabel')}</label>
                  <select id="edit-category-status" value={editCategoryStatus} onChange={(event) => setEditCategoryStatus(event.target.value as typeof editCategoryStatus)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
                    <option value="active">{t('active')}</option><option value="inactive">{t('inactive')}</option>
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor="edit-category-description" className="mb-1 block font-semibold text-slate-700 dark:text-slate-300">
                  Description
                </label>
                <textarea
                  id="edit-category-description"
                  value={editCategoryDescription}
                  onChange={(e) => setEditCategoryDescription(e.target.value)}
                  rows={3}
                  className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>
              <div className="space-y-2">
                <label className="block font-semibold text-slate-700 dark:text-slate-300">{t('categoryImage')}</label>
                <input ref={categoryImageInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) readImageFile(file, setEditCategoryImage);
                  event.target.value = '';
                }} />
                <div className="flex items-center gap-3">
                  {editCategoryImage ? <img src={editCategoryImage} alt="Category preview" className="h-14 w-14 rounded-lg border object-cover" /> : <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-dashed text-slate-400"><ImageIcon className="h-5 w-5" /></div>}
                  <button type="button" onClick={() => categoryImageInputRef.current?.click()} className="rounded-lg border border-slate-200 px-3 py-2 font-semibold dark:border-slate-700">{t('uploadImage')}</button>
                  <input type="url" value={editCategoryImage.startsWith('data:') ? '' : editCategoryImage} onChange={(event) => setEditCategoryImage(event.target.value)} placeholder={t('pasteImageUrl')} className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700 dark:bg-slate-800" />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingCategory(null)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl font-bold bg-emerald-600 hover:bg-emerald-500 text-white"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {brandModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <section role="dialog" aria-modal="true" aria-labelledby="brand-form-title" className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 shadow-2xl dark:bg-slate-900">
            <header className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <h3 id="brand-form-title" className="text-sm font-bold text-slate-900 dark:text-white">{editingBrand ? t('editBrand') : t('addBrand')}</h3>
              <button type="button" onClick={() => setBrandModalOpen(false)} aria-label="Close brand form" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-4 w-4" /></button>
            </header>
            <form onSubmit={handleSaveBrand} className="space-y-3 text-xs">
              <div>
                <label htmlFor="brand-name" className="mb-1 block font-semibold">{t('brandNameRequired')}</label>
                <input id="brand-name" required maxLength={120} value={brandName} onChange={(event) => setBrandName(event.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800" />
              </div>
              <div>
                <label htmlFor="brand-description" className="mb-1 block font-semibold">{t('descriptionLabel')}</label>
                <textarea id="brand-description" maxLength={1000} rows={3} value={brandDescription} onChange={(event) => setBrandDescription(event.target.value)} className="w-full resize-y rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800" />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div><label htmlFor="brand-code" className="mb-1 block font-semibold">{t('brandCode')}</label><input id="brand-code" value={brandCode} onChange={(event) => setBrandCode(event.target.value)} maxLength={50} placeholder="BR-001" className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800" /></div>
                <div><label htmlFor="brand-manufacturer" className="mb-1 block font-semibold">{t('manufacturer')}</label><input id="brand-manufacturer" value={brandManufacturer} onChange={(event) => setBrandManufacturer(event.target.value)} maxLength={160} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800" /></div>
                <div><label htmlFor="brand-website" className="mb-1 block font-semibold">{t('website')}</label><input id="brand-website" type="url" value={brandWebsite} onChange={(event) => setBrandWebsite(event.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800" /></div>
                <div><label htmlFor="brand-contact-information" className="mb-1 block font-semibold">{t('contactInformation')}</label><input id="brand-contact-information" value={brandContactInformation} onChange={(event) => setBrandContactInformation(event.target.value)} maxLength={200} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800" /></div>
                <div><label htmlFor="brand-status" className="mb-1 block font-semibold">{t('statusLabel')}</label><select id="brand-status" value={brandStatus} onChange={(event) => setBrandStatus(event.target.value as typeof brandStatus)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800"><option value="active">{t('active')}</option><option value="inactive">{t('inactive')}</option></select></div>
              </div>
              <div className="space-y-2">
                <label className="block font-semibold">{t('brandLogoImage')}</label>
                <input ref={brandFileInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) readImageFile(file, setBrandImage);
                  event.target.value = '';
                }} />
                <div className="flex items-center gap-3">
                  {brandImage ? <img src={brandImage} alt="Brand preview" className="h-14 w-14 rounded-lg border object-contain" /> : <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-dashed text-slate-400"><ImageIcon className="h-5 w-5" /></div>}
                  <button type="button" onClick={() => brandFileInputRef.current?.click()} className="rounded-lg border border-slate-200 px-3 py-2 font-semibold dark:border-slate-700">{t('uploadLogo')}</button>
                  <input type="url" value={brandImage.startsWith('data:') ? '' : brandImage} onChange={(event) => setBrandImage(event.target.value)} placeholder={t('pasteImageUrl')} className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700 dark:bg-slate-800" />
                </div>
              </div>
              <footer className="flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                <button type="button" onClick={() => setBrandModalOpen(false)} className="rounded-lg px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800">{t('cancel')}</button>
                <button type="submit" className="rounded-lg bg-emerald-600 px-4 py-2 font-bold text-white hover:bg-emerald-500">{t('saveBrand')}</button>
              </footer>
            </form>
          </section>
        </div>
      )}

      {viewingCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <section role="dialog" aria-modal="true" aria-labelledby="category-details-title" className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl dark:bg-slate-900">
            <header className="mb-4 flex items-center justify-between">
              <h2 id="category-details-title" className="text-lg font-bold">{viewingCategory.name}</h2>
              <button type="button" onClick={() => setViewingCategory(null)} aria-label={t('close')} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-4 w-4" /></button>
            </header>
            {viewingCategory.image && <img src={viewingCategory.image} alt={viewingCategory.name} className="mb-4 h-40 w-full rounded-2xl object-cover" />}
            <dl className="grid grid-cols-2 gap-3 text-xs">
              {[[t('categoryCode'), viewingCategory.code], [t('statusLabel'), viewingCategory.status], [t('parentCategory'), categoryRecords.find((record) => record.id === viewingCategory.parentCategoryId)?.name || t('noneGeneral')], [t('createdAt'), viewingCategory.createdAt ? new Date(viewingCategory.createdAt).toLocaleDateString() : '—']].map(([label, value]) => <div key={label} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800"><dt className="text-slate-500">{label}</dt><dd className="mt-1 font-semibold">{value}</dd></div>)}
              <div className="col-span-2 rounded-xl bg-slate-50 p-3 dark:bg-slate-800"><dt className="text-slate-500">{t('descriptionLabel')}</dt><dd className="mt-1 whitespace-pre-wrap font-semibold">{viewingCategory.description || '—'}</dd></div>
            </dl>
            <h3 className="mb-2 mt-5 text-sm font-bold">{t('productsInCategory')} ({products.filter((product) => product.categoryId === viewingCategory.id || product.category === viewingCategory.name).length})</h3>
            <div className="space-y-2">
              {products.filter((product) => product.categoryId === viewingCategory.id || product.category === viewingCategory.name).map((product) => (
                <div key={product.id} className="flex items-center justify-between rounded-xl border border-slate-100 p-3 text-xs dark:border-slate-800"><span>{product.name}</span><span className="font-mono">{product.sku} · {product.stock} {product.unit}</span></div>
              ))}
            </div>
          </section>
        </div>
      )}

      {viewingBrand && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <section role="dialog" aria-modal="true" aria-labelledby="brand-details-title" className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl dark:bg-slate-900">
            <header className="mb-4 flex items-center justify-between">
              <h2 id="brand-details-title" className="text-lg font-bold">{viewingBrand.name}</h2>
              <button type="button" onClick={() => setViewingBrand(null)} aria-label={t('close')} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-4 w-4" /></button>
            </header>
            {viewingBrand.image && <img src={viewingBrand.image} alt={viewingBrand.name} className="mb-4 h-32 w-full rounded-2xl object-contain" />}
            <dl className="grid grid-cols-2 gap-3 text-xs">
              {[[t('brandCode'), viewingBrand.code || '—'], [t('manufacturer'), viewingBrand.manufacturer || '—'], [t('website'), viewingBrand.website || '—'], [t('contactInformation'), viewingBrand.contactInformation || '—'], [t('statusLabel'), viewingBrand.status || 'active'], [t('createdAt'), viewingBrand.createdAt ? new Date(viewingBrand.createdAt).toLocaleDateString() : '—']].map(([label, value]) => <div key={label} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800"><dt className="text-slate-500">{label}</dt><dd className="mt-1 break-words font-semibold">{value}</dd></div>)}
              <div className="col-span-2 rounded-xl bg-slate-50 p-3 dark:bg-slate-800"><dt className="text-slate-500">{t('descriptionLabel')}</dt><dd className="mt-1 whitespace-pre-wrap font-semibold">{viewingBrand.description || '—'}</dd></div>
            </dl>
            <h3 className="mb-2 mt-5 text-sm font-bold">{t('productsByBrand')} ({products.filter((product) => product.brandId === viewingBrand.id || product.brand === viewingBrand.name).length})</h3>
            <div className="space-y-2">
              {products.filter((product) => product.brandId === viewingBrand.id || product.brand === viewingBrand.name).map((product) => <div key={product.id} className="flex items-center justify-between rounded-xl border border-slate-100 p-3 text-xs dark:border-slate-800"><span>{product.name}</span><span className="font-mono">{product.sku} · {product.stock} {product.unit}</span></div>)}
            </div>
          </section>
        </div>
      )}

      {csvImportPreview && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4">
          <section role="dialog" aria-modal="true" aria-labelledby="csv-preview-title" className="max-h-[90vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
            <header className="flex items-center justify-between">
              <h2 id="csv-preview-title" className="text-base font-bold">{t('previewCatalogImport')} · {csvImportPreview.type}</h2>
              <button type="button" onClick={() => setCsvImportPreview(null)} aria-label={t('close')} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-4 w-4" /></button>
            </header>
            <p className="text-xs text-slate-500">{t('catalogImportPreviewNote').replace('{count}', String(csvImportPreview.records.length))}</p>
            {csvImportPreview.errors.length > 0 && <div className="max-h-32 overflow-y-auto rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">{csvImportPreview.errors.map((error, index) => <p key={`${index}-${error}`}>{error}</p>)}</div>}
            <div className="max-h-64 overflow-auto rounded-xl border border-slate-200 dark:border-slate-700">
              <table className="w-full text-left text-xs"><thead className="sticky top-0 bg-slate-100 dark:bg-slate-800"><tr><th className="p-2">{t('name')}</th><th className="p-2">{t('code')}</th><th className="p-2">{t('descriptionLabel')}</th><th className="p-2">{t('statusLabel')}</th></tr></thead>
                <tbody>{csvImportPreview.records.map((record, index) => <tr key={`${record.name}-${index}`} className="border-t border-slate-100 dark:border-slate-800"><td className="p-2">{record.name}</td><td className="p-2 font-mono">{record.code || '—'}</td><td className="max-w-48 truncate p-2">{record.description || '—'}</td><td className="p-2">{record.status}</td></tr>)}</tbody>
              </table>
            </div>
            <footer className="flex justify-end gap-2">
              <button type="button" onClick={() => setCsvImportPreview(null)} className="rounded-xl border px-4 py-2 text-xs font-bold">{t('cancel')}</button>
              <button type="button" disabled={!csvImportPreview.records.length} onClick={commitCatalogCsvImport} className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{t('importValidRecords')}</button>
            </footer>
          </section>
        </div>
      )}

      {bulkAssignmentOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4">
          <section role="dialog" aria-modal="true" aria-labelledby="bulk-assignment-title" className="max-h-[90vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
            <header className="flex items-center justify-between">
              <h2 id="bulk-assignment-title" className="text-base font-bold">{t('bulkAssignProducts')} · {catalogTab === 'categories' ? t('categories') : t('brands')}</h2>
              <button type="button" onClick={() => setBulkAssignmentOpen(false)} aria-label={t('close')} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-4 w-4" /></button>
            </header>
            <label className="block text-xs font-semibold">{catalogTab === 'categories' ? t('selectCategory') : t('selectBrand')}
              <select value={bulkTargetId} onChange={(event) => setBulkTargetId(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800">
                <option value="">{t('chooseTarget')}</option>
                {(catalogTab === 'categories' ? categoryRecords.filter((record) => record.status === 'active') : brands.filter((brand) => brand.status === 'active')).map((record) => <option key={record.id} value={record.id}>{record.name}</option>)}
              </select>
            </label>
            <div className="flex items-center justify-between text-xs text-slate-500">
              <label className="flex items-center gap-2"><input type="checkbox" checked={products.length > 0 && products.every((product) => bulkProductIds.includes(product.id))} onChange={(event) => setBulkProductIds(event.target.checked ? products.map((product) => product.id) : [])} className="accent-emerald-600" />{t('selectAllProducts')}</label>
              <span>{bulkProductIds.length} {t('selected')}</span>
            </div>
            <div className="max-h-72 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2 dark:border-slate-700">
              {products.map((product) => (
                <label key={product.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-800">
                  <input type="checkbox" checked={bulkProductIds.includes(product.id)} onChange={(event) => setBulkProductIds((current) => event.target.checked ? [...current, product.id] : current.filter((id) => id !== product.id))} className="accent-emerald-600" />
                  <span className="min-w-0 flex-1 truncate font-semibold">{product.name}</span>
                  <span className="font-mono text-slate-500">{product.sku}</span>
                  <span className="text-slate-500">{catalogTab === 'categories' ? product.category || t('uncategorized') : product.brand || t('generic')}</span>
                </label>
              ))}
            </div>
            <footer className="flex justify-end gap-2">
              <button type="button" onClick={() => setBulkAssignmentOpen(false)} className="rounded-xl border px-4 py-2 text-xs font-bold">{t('cancel')}</button>
              <button type="button" disabled={!bulkProductIds.length || !bulkTargetId} onClick={handleBulkProductAssignment} className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{t('assignSelectedProducts')}</button>
            </footer>
          </section>
        </div>
      )}

      {categoryToDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4">
          <section role="alertdialog" aria-modal="true" aria-labelledby="delete-category-title" className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
            <h2 id="delete-category-title" className="text-base font-bold">{t('confirmDeleteCategory')}</h2>
            <p className="text-sm text-slate-600 dark:text-slate-300">{t('categoryDeleteProductsNote')}</p>
            {products.some((product) => product.categoryId === categoryToDelete.id || product.category?.toLocaleLowerCase() === categoryToDelete.name.toLocaleLowerCase()) && (
              <div>
                <label htmlFor="delete-category-replacement" className="mb-1 block text-xs font-semibold">{t('reassignProductsToCategory')}</label>
                <select id="delete-category-replacement" value={deleteReplacementId} onChange={(event) => setDeleteReplacementId(event.target.value)} required className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800">
                  <option value="">{t('selectReplacementCategory')}</option>
                  {categoryRecords.filter((record) => record.id !== categoryToDelete.id && record.status === 'active').map((record) => <option key={record.id} value={record.id}>{record.name}</option>)}
                </select>
                {categoryRecords.filter((record) => record.id !== categoryToDelete.id && record.status === 'active').length === 0 && <p className="mt-2 text-xs text-rose-600">{t('createReplacementCategoryFirst')}</p>}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setCategoryToDelete(null)} className="rounded-xl border px-4 py-2 text-xs font-bold">{t('cancel')}</button>
              <button type="button" disabled={isDeletingCategory || (products.some((product) => product.categoryId === categoryToDelete.id || product.category?.toLocaleLowerCase() === categoryToDelete.name.toLocaleLowerCase()) && !deleteReplacementId)} onClick={() => void handleDeleteCategory()} className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{isDeletingCategory ? t('deleting') : t('confirmDelete')}</button>
            </div>
          </section>
        </div>
      )}

      {isBulkDeleteCategoriesOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4">
          <section role="alertdialog" aria-modal="true" aria-labelledby="bulk-delete-categories-title" className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
            <h2 id="bulk-delete-categories-title" className="text-base font-bold">{t('confirmDeleteSelectedCategories')}</h2>
            <p className="text-sm text-slate-600 dark:text-slate-300">{t('bulkCategoryDeleteProductsNote')}</p>
            <div className="max-h-36 overflow-y-auto rounded-xl border border-slate-200 p-3 text-xs dark:border-slate-700">
              {categoryRecords.filter((record) => selectedCategoryIds.includes(record.id)).map((record) => (
                <p key={record.id} className="py-1">{record.name} <span className="text-slate-400">({products.filter((product) => product.categoryId === record.id || product.category?.toLocaleLowerCase() === record.name.toLocaleLowerCase()).length} {t('productsCount')})</span></p>
              ))}
            </div>
            {products.some((product) => selectedCategoryIds.some((id) => {
              const record = categoryRecords.find((categoryRecord) => categoryRecord.id === id);
              return record && (product.categoryId === id || product.category?.toLocaleLowerCase() === record.name.toLocaleLowerCase());
            })) && (
              <div>
                <label htmlFor="bulk-delete-category-replacement" className="mb-1 block text-xs font-semibold">{t('reassignProductsToCategory')}</label>
                <select id="bulk-delete-category-replacement" value={bulkDeleteCategoryReplacementId} onChange={(event) => setBulkDeleteCategoryReplacementId(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800">
                  <option value="">{t('selectReplacementCategory')}</option>
                  {categoryRecords.filter((record) => !selectedCategoryIds.includes(record.id) && record.status === 'active').map((record) => <option key={record.id} value={record.id}>{record.name}</option>)}
                </select>
                {categoryRecords.filter((record) => !selectedCategoryIds.includes(record.id) && record.status === 'active').length === 0 && <p className="mt-2 text-xs text-rose-600">{t('createReplacementCategoryFirst')}</p>}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" disabled={isBulkDeletingCategories} onClick={() => setIsBulkDeleteCategoriesOpen(false)} className="rounded-xl border px-4 py-2 text-xs font-bold disabled:opacity-50">{t('cancel')}</button>
              <button
                type="button"
                disabled={isBulkDeletingCategories || selectedCategoryIds.length === 0 || (
                  products.some((product) => selectedCategoryIds.some((id) => {
                    const record = categoryRecords.find((categoryRecord) => categoryRecord.id === id);
                    return record && (product.categoryId === id || product.category?.toLocaleLowerCase() === record.name.toLocaleLowerCase());
                  })) && !bulkDeleteCategoryReplacementId
                )}
                onClick={() => void handleBulkDeleteCategories()}
                className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
              >
                {isBulkDeletingCategories ? t('deleting') : t('confirmDelete')}
              </button>
            </div>
          </section>
        </div>
      )}

      {brandToDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4">
          <section role="alertdialog" aria-modal="true" aria-labelledby="delete-brand-title" className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
            <h2 id="delete-brand-title" className="text-base font-bold">{t('confirmDeleteBrand')}</h2>
            <p className="text-sm text-slate-600 dark:text-slate-300">{t('brandDeleteProductsNote').replace('{name}', brandToDelete.name)}</p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setBrandToDelete(null)} className="rounded-xl border px-4 py-2 text-xs font-bold">{t('cancel')}</button>
              <button type="button" disabled={deletingBrandId !== null} onClick={() => void confirmDeleteBrand()} className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{deletingBrandId ? t('deleting') : t('confirmDelete')}</button>
            </div>
          </section>
        </div>
      )}

    </div>
  );
};
