#[cfg(feature = "tpm")]
use vault_common::VaultError;
#[cfg(feature = "tpm")]
use vault_common::VaultResult;

pub struct TpmCounter;

impl TpmCounter {
    pub const COUNTER_NV_INDEX: u32 = 0x0150_0000;
    pub const COUNTER_SIZE: u16 = 8;

    // All TPM-dependent methods are gated behind `#[cfg(feature = "tpm")]` with
    // imports scoped inside each function body to avoid polluting the namespace
    // when the feature is disabled.

    #[cfg(feature = "tpm")]
    pub fn ensure_exists(context: &mut tss_esapi::Context) -> VaultResult<()> {
        use tracing::info;
        use tss_esapi::interface_types::resource_handles::Provision;
        use tss_esapi::structures::NvPublicBuilder;

        let idx = tss_esapi::handles::NvIndexTpmHandle::new(Self::COUNTER_NV_INDEX)
            .map_err(|e| VaultError::Tpm(format!("NV index: {}", e)))?;

        if context
            .execute_with_nullauth_session(|c| c.nv_read_public(idx.into()))
            .is_ok()
        {
            info!("NV counter exists");
            return Ok(());
        }

        let nvp = NvPublicBuilder::new()
            .with_nv_index(idx)
            .with_index_name_algorithm(
                tss_esapi::interface_types::algorithm::HashingAlgorithm::Sha256,
            )
            .with_index_attributes(
                tss_esapi::attributes::NvIndexAttributesBuilder::new()
                    .with_owner_write(true)
                    .with_owner_read(true)
                    .with_nv_counter(true)
                    .build()
                    .map_err(|e| VaultError::Tpm(format!("NV attr: {}", e)))?,
            )
            .with_data_area_size(Self::COUNTER_SIZE)
            .build()
            .map_err(|e| VaultError::Tpm(format!("NV build: {}", e)))?;

        context
            .execute_with_nullauth_session(|c| c.nv_define_space(Provision::Owner, None, nvp))
            .map_err(|e| VaultError::Tpm(format!("NV define: {}", e)))?;

        info!("NV counter created");
        Ok(())
    }

    #[cfg(feature = "tpm")]
    pub fn read(context: &mut tss_esapi::Context) -> VaultResult<u64> {
        let idx = tss_esapi::handles::NvIndexTpmHandle::new(Self::COUNTER_NV_INDEX)
            .map_err(|e| VaultError::Tpm(format!("NV index: {}", e)))?;
        let bytes = context
            .execute_with_nullauth_session(|c| {
                c.nv_read(
                    tss_esapi::interface_types::resource_handles::Provision::Owner.into(),
                    idx.into(),
                    Self::COUNTER_SIZE,
                    0,
                )
            })
            .map_err(|e| VaultError::Tpm(format!("NV read: {}", e)))?;
        if bytes.len() >= 8 {
            let mut d = [0u8; 8];
            d.copy_from_slice(&bytes[..8]);
            Ok(u64::from_le_bytes(d))
        } else {
            Ok(0)
        }
    }

    #[cfg(feature = "tpm")]
    pub fn increment(context: &mut tss_esapi::Context) -> VaultResult<u64> {
        let idx = tss_esapi::handles::NvIndexTpmHandle::new(Self::COUNTER_NV_INDEX)
            .map_err(|e| VaultError::Tpm(format!("NV index: {}", e)))?;
        context
            .execute_with_nullauth_session(|c| {
                c.nv_increment(
                    tss_esapi::interface_types::resource_handles::Provision::Owner.into(),
                    idx.into(),
                )
            })
            .map_err(|e| VaultError::Tpm(format!("NV inc: {}", e)))?;
        Self::read(context)
    }

    #[cfg(feature = "tpm")]
    pub fn validate_against_stored(
        context: &mut tss_esapi::Context,
        stored: u64,
    ) -> VaultResult<bool> {
        let hw = Self::read(context)?;
        if stored != hw {
            tracing::warn!("NV counter mismatch! stored={} hw={}", stored, hw);
            return Ok(false);
        }
        Ok(true)
    }
}
