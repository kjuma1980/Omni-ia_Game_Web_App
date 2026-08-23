import React from 'react';
import { GeneratedAsset, ProjectData } from '../types';
import ClassicAnimationStudio from './ClassicAnimationStudio';
import AdvancedAnimationStudio from './AdvancedAnimationStudio';

interface AnimationStudioProps {
  assets: GeneratedAsset[];
  state: ProjectData['animationState'];
  updateState: (updates: Partial<ProjectData['animationState']>) => void;
  apiSettings?: ProjectData['apiSettings'];
  showTooltips?: boolean;
}

const AnimationStudio: React.FC<AnimationStudioProps> = ({ assets, state, updateState, apiSettings, showTooltips = true }) => {
  const useAdvanced = apiSettings?.video.useAdvancedPipeline ?? false;

  if (useAdvanced) {
    return (
      <AdvancedAnimationStudio 
        assets={assets} 
        state={state} 
        updateState={updateState} 
        apiSettings={apiSettings} 
        showTooltips={showTooltips} 
      />
    );
  }

  return (
    <ClassicAnimationStudio 
      assets={assets} 
      state={state} 
      updateState={updateState} 
      apiSettings={apiSettings} 
      showTooltips={showTooltips} 
    />
  );
};

export default AnimationStudio;
