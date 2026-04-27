import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { cachedGet } from '../utils/api.js';

function LocationSelector({
  value,
  onChange,
  required = true,
  disabled = false,
  idPrefix = 'location',
  refreshKey = 0,
}) {
  const [stateId, setStateId] = useState(value?.stateId || '');
  const [districtId, setDistrictId] = useState(value?.districtId || '');
  const [blockId, setBlockId] = useState(value?.blockId || '');

  const [stateName, setStateName] = useState(value?.stateName || '');
  const [districtName, setDistrictName] = useState(value?.districtName || '');
  const [blockName, setBlockName] = useState(value?.blockName || '');

  const [searchState, setSearchState] = useState(value?.stateName || '');
  const [searchDistrict, setSearchDistrict] = useState(value?.districtName || '');
  const [searchBlock, setSearchBlock] = useState(value?.blockName || '');

  const [states, setStates] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [blocks, setBlocks] = useState([]);

  const [loadingStates, setLoadingStates] = useState(false);
  const [loadingDistricts, setLoadingDistricts] = useState(false);
  const [loadingBlocks, setLoadingBlocks] = useState(false);

  const [openStates, setOpenStates] = useState(false);
  const [openDistricts, setOpenDistricts] = useState(false);
  const [openBlocks, setOpenBlocks] = useState(false);

  const deferredStateSearch = useDeferredValue(searchState);
  const deferredDistrictSearch = useDeferredValue(searchDistrict);
  const deferredBlockSearch = useDeferredValue(searchBlock);

  useEffect(() => {
    setStateId(value?.stateId || '');
    setDistrictId(value?.districtId || '');
    setBlockId(value?.blockId || '');

    setStateName(value?.stateName || '');
    setDistrictName(value?.districtName || '');
    setBlockName(value?.blockName || '');

    setSearchState(value?.stateName || '');
    setSearchDistrict(value?.districtName || '');
    setSearchBlock(value?.blockName || '');
  }, [value?.stateId, value?.districtId, value?.blockId, value?.stateName, value?.districtName, value?.blockName]);

  useEffect(() => {
    let mounted = true;

    async function fetchStates() {
      setLoadingStates(true);
      try {
        const response = await cachedGet('/states', { skipErrorToast: true }, { ttl: 5 * 60 * 1000 });
        if (!mounted) return;
        setStates(response.data || []);
      } catch (_error) {
        if (!mounted) return;
        setStates([]);
      } finally {
        if (mounted) {
          setLoadingStates(false);
        }
      }
    }

    fetchStates();

    return () => {
      mounted = false;
    };
  }, [refreshKey]);

  useEffect(() => {
    const payload = {
      stateId,
      districtId,
      blockId,
      stateName,
      districtName,
      blockName,
    };
    onChange(payload);
  }, [
    stateId,
    districtId,
    blockId,
    stateName,
    districtName,
    blockName,
    onChange,
  ]);

  const filteredStates = useMemo(() => {
    const key = deferredStateSearch.trim().toLowerCase();
    if (!key) {
      return states.slice(0, 10);
    }
    return states
      .filter((state) => state.name.toLowerCase().includes(key))
      .slice(0, 10);
  }, [deferredStateSearch, states]);

  useEffect(() => {
    if (!stateId) {
      setDistricts([]);
      setBlocks([]);
      return;
    }

    const timeout = window.setTimeout(async () => {
      setLoadingDistricts(true);
      try {
        const response = await cachedGet('/districts', {
          params: {
            stateId,
            search: deferredDistrictSearch,
          },
          skipErrorToast: true,
        }, { ttl: 60 * 1000 });
        setDistricts(response.data || []);
      } catch (_error) {
        setDistricts([]);
      } finally {
        setLoadingDistricts(false);
      }
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [deferredDistrictSearch, refreshKey, stateId]);

  useEffect(() => {
    if (!districtId) {
      setBlocks([]);
      return;
    }

    const timeout = window.setTimeout(async () => {
      setLoadingBlocks(true);
      try {
        const response = await cachedGet('/blocks', {
          params: {
            districtId,
            search: deferredBlockSearch,
          },
          skipErrorToast: true,
        }, { ttl: 60 * 1000 });
        setBlocks(response.data || []);
      } catch (_error) {
        setBlocks([]);
      } finally {
        setLoadingBlocks(false);
      }
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [deferredBlockSearch, districtId, refreshKey]);

  function handleSelectState(selectedState) {
    setStateId(selectedState.id);
    setStateName(selectedState.name);
    setSearchState(selectedState.name);

    setDistrictId('');
    setDistrictName('');
    setSearchDistrict('');

    setBlockId('');
    setBlockName('');
    setSearchBlock('');

    setOpenStates(false);
    setOpenDistricts(true);
    setOpenBlocks(false);
  }

  function handleSelectDistrict(selectedDistrict) {
    setDistrictId(selectedDistrict.id);
    setDistrictName(selectedDistrict.name);
    setSearchDistrict(selectedDistrict.name);

    setBlockId('');
    setBlockName('');
    setSearchBlock('');

    setOpenDistricts(false);
    setOpenBlocks(true);
  }

  function handleSelectBlock(selectedBlock) {
    setBlockId(selectedBlock.id);
    setBlockName(selectedBlock.name);
    setSearchBlock(selectedBlock.name);
    setOpenBlocks(false);
  }

  return (
    <div className="grid gap-3 md:grid-cols-3">
      <div className="relative">
        <label htmlFor={`${idPrefix}-state`} className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
          State
        </label>
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-3 text-slate-400" />
          <input
            id={`${idPrefix}-state`}
            type="text"
            value={searchState}
            onChange={(event) => {
              setSearchState(event.target.value);
              setOpenStates(true);
            }}
            onFocus={() => setOpenStates(true)}
            placeholder="Search state"
            className="w-full rounded-xl border border-slate-300 px-9 py-2.5"
            disabled={disabled}
            required={required}
          />
          {loadingStates ? <Loader2 size={15} className="absolute right-3 top-3 animate-spin text-slate-400" /> : null}
        </div>

        {openStates && !disabled ? (
          <div className="surface-panel absolute z-20 mt-1 max-h-52 w-full overflow-auto rounded-xl">
            {filteredStates.map((state) => (
              <button
                key={state.id}
                type="button"
                onClick={() => handleSelectState(state)}
                className="block w-full px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-[rgba(91,215,255,0.1)]"
              >
                {state.name}
              </button>
            ))}
            {!loadingStates && filteredStates.length === 0 ? (
              <p className="px-3 py-2 text-sm text-slate-500">No results found</p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="relative">
        <label htmlFor={`${idPrefix}-district`} className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
          District
        </label>
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-3 text-slate-400" />
          <input
            id={`${idPrefix}-district`}
            type="text"
            value={searchDistrict}
            onChange={(event) => {
              setSearchDistrict(event.target.value);
              setOpenDistricts(true);
            }}
            onFocus={() => stateId && setOpenDistricts(true)}
            placeholder={stateId ? 'Search district' : 'Select state first'}
            className="w-full rounded-xl border border-slate-300 px-9 py-2.5"
            disabled={disabled || !stateId}
            required={required}
          />
          {loadingDistricts ? <Loader2 size={15} className="absolute right-3 top-3 animate-spin text-slate-400" /> : null}
        </div>

        {openDistricts && stateId && !disabled ? (
          <div className="surface-panel absolute z-20 mt-1 max-h-52 w-full overflow-auto rounded-xl">
            {districts.map((district) => (
              <button
                key={district.id}
                type="button"
                onClick={() => handleSelectDistrict(district)}
                className="block w-full px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-[rgba(91,215,255,0.1)]"
              >
                {district.name}
              </button>
            ))}
            {!loadingDistricts && districts.length === 0 ? (
              <p className="px-3 py-2 text-sm text-slate-500">No results found</p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="relative">
        <label htmlFor={`${idPrefix}-block`} className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
          Block
        </label>
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-3 text-slate-400" />
          <input
            id={`${idPrefix}-block`}
            type="text"
            value={searchBlock}
            onChange={(event) => {
              setSearchBlock(event.target.value);
              setOpenBlocks(true);
            }}
            onFocus={() => districtId && setOpenBlocks(true)}
            placeholder={districtId ? 'Search block' : 'Select district first'}
            className="w-full rounded-xl border border-slate-300 px-9 py-2.5"
            disabled={disabled || !districtId}
            required={required}
          />
          {loadingBlocks ? <Loader2 size={15} className="absolute right-3 top-3 animate-spin text-slate-400" /> : null}
        </div>

        {openBlocks && districtId && !disabled ? (
          <div className="surface-panel absolute z-20 mt-1 max-h-52 w-full overflow-auto rounded-xl">
            {blocks.map((block) => (
              <button
                key={block.id}
                type="button"
                onClick={() => handleSelectBlock(block)}
                className="block w-full px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-[rgba(91,215,255,0.1)]"
              >
                {block.name}
              </button>
            ))}
            {!loadingBlocks && blocks.length === 0 ? (
              <p className="px-3 py-2 text-sm text-slate-500">No results found</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default LocationSelector;
