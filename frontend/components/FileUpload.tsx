'use client';

import { FC, useRef, useState } from 'react';

interface FileUploadProps {
  onFileUpload: (file: File) => void;
  uploadedFile: File | null;
}

const FileUpload: FC<FileUploadProps> = ({ onFileUpload, uploadedFile }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFileSelect = (file: File) => {
    console.log('파일 선택:', file.name);
    if (file.type === 'application/pdf') {
      onFileUpload(file);
    } else {
      alert('PDF 파일만 업로드 가능합니다');
    }
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.currentTarget.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-xl font-bold text-gray-800 mb-4">📄 파일 업로드</h2>

      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition duration-200 ${
          isDragging
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 bg-gray-50 hover:border-blue-400 hover:bg-blue-50'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          onChange={handleInputChange}
          className="hidden"
        />

        <div className="text-4xl mb-3">📁</div>
        <p className="text-gray-700 font-semibold mb-2">
          {isDragging ? 'PDF를 여기에 놓으세요' : 'PDF 파일을 드래그하거나 클릭하세요'}
        </p>
        <p className="text-gray-500 text-sm">최대 파일 크기: 50MB</p>
      </div>

      {uploadedFile && (
        <div className="mt-6 p-4 bg-green-50 rounded-lg border border-green-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-600">📎 업로드된 파일</p>
              <p className="text-gray-800 font-semibold mt-1">{uploadedFile.name}</p>
              <p className="text-gray-500 text-sm mt-1">
                크기: {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
            <div className="text-3xl">✅</div>
          </div>
        </div>
      )}

      {!uploadedFile && (
        <div className="mt-6 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
          <p className="text-sm text-yellow-800">
            💡 <strong>팁:</strong> PDF 파일을 업로드한 후 "질문 생성" 버튼을 클릭하면 자동으로 질문이 생성됩니다.
          </p>
        </div>
      )}
    </div>
  );
};

export default FileUpload;
