export type RetailerCode = 'cu' | 'gs25' | 'seven' | 'emart24'
export type PromotionType = 'none' | '1+1' | '2+1' | '3+1' | 'sale' | 'new' | 'gift'

export type NormalizedProduct = {
  retailerCode: RetailerCode
  externalKey: string
  brand: string
  name: string
  normalizedName: string
  price: number
  category: string
  tags: string[]
  imageUrl?: string
  promotionType: PromotionType
  purchaseQuantity: number
  rewardQuantity: number
  discountPrice?: number
  startDate?: string
  endDate?: string
  collectedAt: string
  isNew?: boolean
}
