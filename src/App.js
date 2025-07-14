/* global __firebase_config, __app_id, __initial_auth_token */
import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';

// Import Firebase services
import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInWithCustomToken,
  onAuthStateChanged,
  signOut,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup
} from "firebase/auth";
import {
  getFirestore,
  collection,
  query,
  onSnapshot,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  runTransaction,
  setDoc
} from "firebase/firestore";
// Uklonjeni importi za Firebase Cloud Functions jer sada koristimo Netlify Functions
// import { getFunctions, httpsCallable } from "firebase/functions";


// Authorized email for access. Only this email will have access to the application data.
// Any other logged-in Firebase user (via email/password or Google) will be signed out.
const AUTHORIZED_EMAIL = 'alphaservis@alphaservis.com';

// Reusable InfoModal Component - now acts as a disappearing toast notification
const InfoModal = ({ message, onClose, type = 'info' }) => { // Added 'type' prop
  useEffect(() => {
    if (message) {
      console.log("InfoModal prikazan:", message); // Debug log for when modal actually renders
      const timer = setTimeout(() => {
        onClose();
      }, 8000); // Message disappears after 8 seconds (increased for debugging)
      return () => clearTimeout(timer);
    }
  }, [message, onClose]);

  if (!message) return null;

  let bgColorClass = 'bg-blue-600'; // Default blue for info
  if (type === 'success') {
    bgColorClass = 'bg-green-600'; // Green for success
  } else if (type === 'error') {
    bgColorClass = 'bg-red-600'; // Red for error
  } else if (type === 'warning') { // New type for warnings
    bgColorClass = 'bg-yellow-600'; // Yellow for warnings
  }

  return (
    <div className={`fixed top-8 right-8 z-[100000] p-6 w-auto min-w-[300px] ${bgColorClass} text-white rounded-xl shadow-2xl animate-fade-in-down`}>
      <div className="flex items-center justify-between">
        <p className="text-lg font-semibold">{message}</p>
        <button onClick={onClose} className="ml-4 text-white hover:text-blue-200">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>
    </div>
  );
};


// Reusable ConfirmationModal Component
const ConfirmationModal = ({ message, onConfirm, onCancel }) => {
  if (!message) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white p-6 rounded-lg shadow-xl max-w-sm w-full text-center">
        <p className="text-lg font-semibold text-gray-800 mb-6">{message}</p>
        <div className="flex justify-center space-x-4">
          <button
            onClick={onConfirm}
            className="px-6 py-2 bg-red-600 text-white font-bold rounded-md hover:bg-red-700 transition duration-300"
          >
            Potvrdi
          </button>
          <button
            onClick={onCancel}
            className="px-6 py-2 bg-gray-300 text-gray-800 font-bold rounded-md hover:bg-gray-400 transition duration-300"
          >
            Odustani
          </button>
        </div>
      </div>
    </div>
  );
};

// PrintPurchaseBlockModal Component
const PrintPurchaseBlockModal = ({ device, onClose, purchaseBlockText, companyInfo }) => {
  const printRef = useRef();

  const handlePrint = async () => {
    const input = printRef.current;
    if (input) {
      if (typeof window.html2canvas === 'undefined' || typeof window.jsPDF === 'undefined') {
        alert("Biblioteke za generiranje PDF-a se još učitavaju. Molimo pričekajte trenutak i pokušajte ponovo.");
        return;
      }
      
      window.html2canvas(input, { scale: 2 }).then((canvas) => {
        const imgData = canvas.toDataURL('image/png');
        const pdf = new window.jsPDF('p', 'mm', 'a4');
        const imgWidth = 210;
        const pageHeight = 297;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        let heightLeft = imgHeight;
        let position = 0;

        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;

        while (heightLeft >= 0) {
          position = heightLeft - imgHeight;
          pdf.addPage();
          pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
          heightLeft -= pageHeight;
        }

        pdf.save(`Otkupni_blok_${device.orderNumber || device.id}.pdf`);
      }).catch(error => {
        console.error("Error generating PDF:", error);
        alert("Greška pri generiranju PDF-a. Molimo pokušajte ponovo.");
      });
    }
  };

  // Use companyInfo prop instead of hardcoded values
  const companyName = companyInfo.name || "N/A";
  const companyAddress = companyInfo.address || "N/A";
  const companyOIB = companyInfo.oib || "N/A";
  const companyTel = companyInfo.tel || "N/A";
  const companyEmail = companyInfo.email || "N/A";


  const formattedDate = device.purchaseDate ? new Date(device.purchaseDate).toLocaleDateString('hr-HR') : 'N/A';
  const productName = `${device.brand || ''}/${device.model || ''} ${device.storageGB ? `${device.storageGB} GB` : ''}`;
  const purchasePriceFormatted = typeof device.purchasePrice === 'number' ? device.purchasePrice.toFixed(2) : (device.purchasePrice || '0.00');

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center p-4 z-[100001]">
      <div className="bg-white p-8 rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-bold text-gray-800 mb-4 text-center">Pregled Otkupnog Bloka</h2>
        
        {/* Content to be printed */}
        <div ref={printRef} className="p-6 border border-gray-300 rounded-lg bg-white text-gray-800 leading-relaxed text-sm">
          <div className="text-center mb-6">
            <h1 className="text-3xl font-bold text-blue-700">Alpha servis</h1>
            <p className="text-lg mt-2">{companyName}</p>
            <p>{companyAddress} OIB: {companyOIB}</p>
            <p>tel: {companyTel}</p>
            <p>email: {companyEmail}</p>
          </div>

          <div className="mb-8 border-b-2 border-gray-300 pb-4">
            <h2 className="text-xl font-bold text-center">Otkupni blok {device.orderNumber || `OTK-${device.id?.substring(0, 6).toUpperCase()}`}</h2>
          </div>

          <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p><span className="font-semibold">Naziv proizvoda:</span> {productName}</p>
              <p><span className="font-semibold">IMEI:</span> {device.imei || '-'}</p>
            </div>
            <div>
              <p><span className="font-semibold">Datum:</span> {formattedDate}</p>
              <p><span className="font-semibold">Iznos:</span> {purchasePriceFormatted} €</p>
            </div>
          </div>

          <p className="mb-8 text-justify">
            {purchaseBlockText}
          </p>

          <div className="grid grid-cols-2 gap-8 text-center mt-12">
            <div>
              <p className="font-semibold">Kupac: {companyName}</p>
              <p className="mt-12 border-t border-gray-400 pt-1">Potpis kupca / Pečat:</p>
            </div>
            <div>
              <p className="font-semibold">Prodavatelj: {device.personWhoSold || 'N/A'}</p>
              <p className="font-semibold">OIB: {device.oibWhoSold || 'N/A'}</p>
              <p className="mt-8 border-t border-gray-400 pt-1">Potpis prodavatelja:</p>
            </div>
          </div>
        </div>

        <div className="flex justify-end mt-6 space-x-4">
          <button
            onClick={handlePrint}
            className="px-6 py-2 bg-blue-600 text-white font-bold rounded-md hover:bg-blue-700 transition duration-300 shadow-md"
          >
            Preuzmi kao PDF
          </button>
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gray-300 text-gray-800 font-bold rounded-md hover:bg-gray-400 transition duration-300 shadow-md"
          >
            Zatvori
          </button>
        </div>
      </div>
    </div>
  );
};


// DeviceDetailsPage Component - full page for displaying and editing device details
const DeviceDetailsPage = ({ device, onUpdateDevice, onGoBack, employees, onDeleteDevice, purchaseBlockText, companyInfo, onStatusChangeTriggerWooCommerceSync }) => {
  const [editedDevice, setEditedDevice] = useState({
    ...device,
    additionalCost: device.additionalCost || 0,
    notes: device.notes || [],
    currentNote: '',
    // Initialize soldBy, ensure it's a string
    soldBy: device.soldBy || '', 
  });
  const [showSalePricePrompt, setShowSalePricePrompt] = useState(false);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);

  // Recalculate margin if salePrice or purchasePrice changes during edit
  useEffect(() => {
    const purchase = parseFloat(editedDevice.purchasePrice) || 0;
    const actualSale = parseFloat(editedDevice.actualSalePrice) || 0;
    const additionalCost = parseFloat(editedDevice.additionalCost) || 0;

    const totalCost = purchase + additionalCost;

    if (!isNaN(purchase) && !isNaN(actualSale) && actualSale > totalCost && purchase > 0) {
      const marginEuro = (actualSale - totalCost).toFixed(2);
      const marginPercent = (((actualSale - totalCost) * 100) / totalCost).toFixed(2);
      setEditedDevice(prev => ({ ...prev, marginEuro: marginEuro + '€', marginPercent: marginPercent + '%' }));
    } else {
      setEditedDevice(prev => ({ ...prev, marginEuro: '0.00€', marginPercent: '0.00%' }));
    }
  }, [editedDevice.purchasePrice, editedDevice.actualSalePrice, editedDevice.additionalCost]);


  const handleEditChange = (e) => {
    const { name, value, type, checked } = e.target;
    setEditedDevice(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleStatusChange = (newStatus) => {
    if (newStatus === 'Prodan') {
      const salePrice = parseFloat(editedDevice.actualSalePrice);
      if (isNaN(salePrice) || salePrice <= 0) {
        setShowSalePricePrompt(true);
        return;
      }
      // If status is 'Prodan' and soldBy is empty, show a warning or set a default
      if (!editedDevice.soldBy) {
        // You might want to show a toast message here instead of preventing status change
        // For now, I'll allow it but encourage user to fill it.
        // showToast('Molimo odaberite djelatnika koji je prodao uređaj.', 'warning');
      }
    } else {
      // If not 'Prodan', clear soldBy
      setEditedDevice(prev => ({ ...prev, soldBy: '' }));
    }

    const previousStatus = editedDevice.status;

    // Update local state immediately for responsiveness
    setEditedDevice(prev => ({ ...prev, status: newStatus }));

    const updatedData = { status: newStatus };
    if (newStatus === 'Na stanju' && (previousStatus === 'Prodan' || previousStatus === 'Rezerviran')) {
        updatedData.actualSalePrice = 0;
        updatedData.marginEuro = '0.00€';
        updatedData.marginPercent = '0.00%';
    }
    // Pass soldBy in updatedData if status is Prodan, otherwise ensure it's cleared if not Prodan
    if (newStatus === 'Prodan') {
        updatedData.soldBy = editedDevice.soldBy;
    } else {
        updatedData.soldBy = ''; // Clear soldBy if not sold
    }

    // Call the parent update function
    onUpdateDevice({ ...editedDevice, ...updatedData });

    // Trigger WooCommerce sync if status changes from 'Na stanju' to 'Prodan' or 'Rezerviran'
    if (previousStatus === 'Na stanju' && (newStatus === 'Prodan' || newStatus === 'Rezerviran')) {
        onStatusChangeTriggerWooCommerceSync();
    }
    
    setShowSalePricePrompt(false);
  };


  const handleSave = () => {
    const updatedDevice = {
      ...editedDevice,
      purchasePrice: parseFloat(editedDevice.purchasePrice) || 0,
      actualSalePrice: parseFloat(editedDevice.actualSalePrice) || 0,
      additionalCost: parseFloat(editedDevice.additionalCost) || 0,
    };
    delete updatedDevice.currentNote;
    onUpdateDevice(updatedDevice);
  };

  const handleDeleteClick = () => {
    setShowDeleteConfirmation(true);
  };

  const confirmDelete = () => {
    onDeleteDevice(editedDevice.id);
    setShowDeleteConfirmation(false);
    onGoBack();
  };

  const handleAddNote = () => {
    if (editedDevice.currentNote && editedDevice.currentNote.trim()) {
      const newNote = {
        text: editedDevice.currentNote.trim(),
        timestamp: new Date().toISOString(),
      };
      setEditedDevice(prev => ({
        ...prev,
        notes: [...(prev.notes || []), newNote],
        currentNote: '',
      }));
    }
  };


  return (
    <div className="bg-white p-6 rounded-lg shadow-md w-full mx-auto my-6">
      <div className="flex justify-between items-center mb-4">
        <button
          onClick={onGoBack}
          className="px-3 py-1.5 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition duration-300 flex items-center text-sm"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 = 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
          Povratak na Zalihe
        </button>
        <h2 className="text-2xl font-bold text-gray-800">Detalji Uređaja: {editedDevice.brand} {editedDevice.model} {editedDevice.storageGB ? `${editedDevice.storageGB} GB` : ''} {editedDevice.color || ''}</h2>
        <div></div>
      </div>

      <div className="grid grid-cols-1 gap-4 text-gray-700">
        <div className="col-span-full">
          <h3 className="text-xl font-semibold mb-2 text-blue-700">Osnovne Informacije</h3>
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            <div className="flex flex-col">
              <label className="text-sm font-medium text-gray-700 mb-0.5">Marka:</label>
              <input type="text" name="brand" value={editedDevice.brand} onChange={handleEditChange} className="p-1.5 border rounded-md w-[120px] text-sm" />
            </div>
            <div className="flex flex-col">
              <label className="text-sm font-medium text-gray-700 mb-0.5">Model:</label>
              <input type="text" name="model" value={editedDevice.model} onChange={handleEditChange} className="p-1.5 border rounded-md w-[150px] text-sm" />
            </div>
            <div className="flex flex-col">
              <label className="text-sm font-medium text-gray-700 mb-0.5">Boja:</label>
              <input type="text" name="color" value={editedDevice.color} onChange={handleEditChange} className="p-1.5 border rounded-md w-[100px] text-sm" />
            </div>
            <div className="flex flex-col">
              <label className="text-sm font-medium text-gray-700 mb-0.5">Kapacitet (GB):</label>
              <input type="text" name="storageGB" value={editedDevice.storageGB} onChange={handleEditChange} className="p-1.5 border rounded-md w-[80px] text-sm" placeholder="128" />
            </div>
            <div className="flex flex-col">
              <label className="text-sm font-medium text-gray-700 mb-0.5">Datum Otkupa:</label>
              <input type="date" name="purchaseDate" value={editedDevice.purchaseDate} onChange={handleEditChange} className="p-1.5 border rounded-md w-[130px] text-sm" />
            </div>
            <div className="flex flex-col">
              <label className="text-sm font-medium text-gray-700 mb-0.5">Stanje:</label>
              <div className="flex items-center gap-2 mt-0.5">
                <label className="inline-flex items-center">
                  <input type="radio" name="condition" value="Novo" checked={editedDevice.condition === 'Novo'} onChange={handleEditChange} className="form-radio h-5 w-5 text-blue-600 rounded-full" />
                  <span className="ml-1 text-gray-900 text-sm">Novo</span>
                </label>
                <label className="inline-flex items-center">
                  <input type="radio" name="condition" value="Rabljeno" checked={editedDevice.condition === 'Rabljeno'} onChange={handleEditChange} className="form-radio h-5 w-5 text-blue-600 rounded-full" />
                  <span className="ml-1 text-gray-900 text-sm">Rabljeno</span>
                </label>
              </div>
            </div>
            <div className="flex flex-col">
              <label className="text-sm font-medium text-gray-700 mb-0.5">IMEI/Serijski Broj:</label>
              <input type="text" name="imei" value={editedDevice.imei} onChange={handleEditChange} className="p-1.5 border rounded-md w-[180px] text-sm" />
            </div>
             <div className="flex flex-col">
              <label className="text-sm font-medium text-gray-700 mb-0.5">Broj Naloga:</label>
              <input type="text" name="orderNumber" value={editedDevice.orderNumber || ''} className="p-1.5 border rounded-md w-[120px] text-sm bg-gray-100" readOnly />
            </div>
          </div>
        </div>

        <div className="col-span-full">
          <h3 className="text-xl font-semibold mt-4 mb-2 text-blue-700">Financijski Podaci</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block">Otkupna Cijena (€): <input type="number" name="purchasePrice" value={editedDevice.purchasePrice} onChange={handleEditChange} className="p-2 border rounded-md w-full text-sm" step="0.01" /></label>
            <label className="block">Dodatni Trošak (€): <input type="number" name="additionalCost" value={editedDevice.additionalCost} onChange={handleEditChange} className="p-2 border rounded-md w-full text-sm" step="0.01" /></label>
            <label className="block">Prodajna Cijena (stvarna) (€): <input type="number" name="actualSalePrice" value={editedDevice.actualSalePrice} onChange={handleEditChange} className="p-2 border rounded-md w-full text-sm" step="0.01" /></label>
            <p>Marža (%): {editedDevice.marginPercent}</p>
            <p>Marža (€): {editedDevice.marginEuro}</p>
          </div>
        </div>

        <div className="col-span-full">
          <h3 className="text-xl font-semibold mt-4 mb-2 text-blue-700">Status i Integracija</h3>
          <div className="flex flex-col">
            <label className="text-sm font-medium text-gray-700 mb-1">Status:</label>
            <div className="flex space-x-2 flex-wrap">
              <button
                type="button"
                onClick={() => handleStatusChange('Na stanju')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${editedDevice.status === 'Na stanju' ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-800 hover:bg-gray-300'}`}
              >
                Na stanju
              </button>
              <button
                type="button"
                onClick={() => handleStatusChange('Prodan')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${editedDevice.status === 'Prodan' ? 'bg-red-600 text-white' : 'bg-gray-200 text-gray-800 hover:bg-gray-300'}`}
              >
                Prodan
              </button>
              <button
                type="button"
                onClick={() => handleStatusChange('Rezerviran')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${editedDevice.status === 'Rezerviran' ? 'bg-yellow-600 text-white' : 'bg-gray-200 text-gray-800 hover:bg-gray-300'}`}
              >
                Rezerviran
              </button>
            </div>
          </div>
          {editedDevice.status === 'Prodan' && (
            <div className="mt-4">
              <label className="block">Prodano od (Djelatnik):
                <select name="soldBy" value={editedDevice.soldBy || ''} onChange={handleEditChange} className="p-2 border rounded-md w-full text-sm">
                  <option value="">Odaberite djelatnika</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.name}>{emp.name}</option>
                  ))}
                </select>
              </label>
            </div>
          )}
          <label className="block mt-4">WooCommerce ID: <input type="text" name="wooCommerceId" value={editedDevice.wooCommerceId} onChange={handleEditChange} className="p-2 border rounded-md w-full text-sm" /></label>
          <label className="block mt-2">Za Web:
            <input type="checkbox" name="forWeb" checked={editedDevice.forWeb} onChange={handleEditChange} className="ml-2 form-checkbox h-5 w-5 text-blue-600 rounded" />
          </label>
        </div>

        <div className="col-span-full border border-blue-200 rounded-lg bg-blue-50 p-4 mt-4">
          <h3 className="text-xl font-semibold mb-2 text-blue-700">Podaci o Osobi od Koje je Otkupljeno</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block">Ime i prezime osobe: <input type="text" name="personWhoSold" value={editedDevice.personWhoSold} onChange={handleEditChange} className="p-2 border rounded-md w-full text-sm" /></label>
            <label className="block">OIB Osobe: <input type="text" name="oibWhoSold" value={editedDevice.oibWhoSold} onChange={handleEditChange} maxLength="11" className="p-2 border rounded-md w-full text-sm" /></label>
            <label className="block">Adresa Osobe: <input type="text" name="personAddress" value={editedDevice.personAddress} onChange={handleEditChange} className="p-2 border rounded-md w-full text-sm" /></label>
            <label className="block">Otkupio/la (Djelatnik):
              <select name="personName" value={editedDevice.personName} onChange={handleEditChange} className="p-2 border rounded-md w-full text-sm">
                <option value="">Odaberite djelatnika</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.name}>{emp.name}</option>
                ))}
              </select>
            </label>
            <label className="block">Tko je testirao:
              <select name="testedBy" value={editedDevice.testedBy || ''} onChange={handleEditChange} className="p-2 border rounded-md w-full text-sm">
                <option value="">Odaberite djelatnika</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.name}>{emp.name}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="col-span-full border border-gray-200 rounded-lg bg-gray-50 p-4 mt-4">
          <h3 className="text-xl font-semibold mb-2 text-gray-700">Napomene</h3>
          <div className="mb-4">
            <textarea
              className="p-2 border rounded-md w-full text-sm resize-y focus:ring-blue-500 focus:border-blue-500"
              placeholder="Dodajte novu napomenu..."
              value={editedDevice.currentNote || ''}
              onChange={(e) => setEditedDevice(prev => ({...prev, currentNote: e.target.value}))}
              rows="3"
            ></textarea>
            <button
              onClick={handleAddNote}
              className="mt-2 px-4 py-2 bg-blue-600 text-white font-bold rounded-md hover:bg-blue-700 transition duration-300"
            >
              Dodaj Napomenu
            </button>
          </div>
          <div className="space-y-3 max-h-60 overflow-y-auto">
            {editedDevice.notes && editedDevice.notes.length > 0 ? (
              editedDevice.notes.map((note, index) => (
                <div key={index} className="bg-white p-3 rounded-md shadow-sm border border-gray-100">
                  <p className="text-gray-800 text-sm">{note.text}</p>
                  <p className="text-xs text-gray-500 mt-1">{new Date(note.timestamp).toLocaleString('hr-HR')}</p>
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-sm">Nema unesenih napomena.</p>
            )}
          </div>
        </div>


        <div className="col-span-full flex justify-center mt-6 space-x-4">
          <button
            onClick={handleSave}
            className="px-6 py-3 bg-green-600 text-white font-bold rounded-lg shadow-lg hover:bg-green-700 transition duration-300 transform hover:scale-105"
          >
            Spremi Promjene
          </button>
          <button
            onClick={() => setShowPrintModal(true)}
            className="px-6 py-3 bg-indigo-600 text-white font-bold rounded-lg shadow-lg hover:bg-indigo-700 transition duration-300 transform hover:scale-105"
          >
            Isprintaj Otkupni Blok
          </button>
          <button
            onClick={handleDeleteClick}
            className="px-6 py-3 bg-red-600 text-white font-bold rounded-lg shadow-lg hover:bg-red-700 transition duration-300 transform hover:scale-105"
          >
            Obriši Uređaj
          </button>
          <button
            onClick={onGoBack}
            className="px-6 py-3 bg-gray-400 text-white font-bold rounded-lg shadow-lg hover:bg-gray-500 transition duration-300 transform hover:scale-105"
          >
            Odustani
          </button>
        </div>
      </div>
      {showSalePricePrompt && (
        <InfoModal
          message="Molimo unesite Prodajnu Cijenu (stvarnu) prije označavanja kao prodano."
          onClose={() => setShowSalePricePrompt(false)}
          type="error"
        />
      )}
      {showDeleteConfirmation && (
        <ConfirmationModal
          message={`Jeste li sigurni da želite obrisati uređaj ${editedDevice.brand} ${editedDevice.model}?`}
          onConfirm={confirmDelete}
          onCancel={() => setShowDeleteConfirmation(false)}
        />
      )}
      {showPrintModal && (
        <PrintPurchaseBlockModal
          device={editedDevice}
          onClose={() => setShowPrintModal(false)}
          purchaseBlockText={purchaseBlockText}
          companyInfo={companyInfo} // Pass companyInfo prop
        />
      )}
    </div>
  );
};

// SettingsPage Component
const SettingsPage = ({ db, userId, appId, purchaseBlockText, updatePurchaseBlockText, companyInfo, updateCompanyInfo, showToast, onImportDevices, onExportDevices, woocommerceApiKeys, updateWooCommerceApiKeys, onTriggerWooCommerceSync }) => {
  const [editedPurchaseBlockText, setEditedPurchaseBlockText] = useState(purchaseBlockText);
  const [editedCompanyInfo, setEditedCompanyInfo] = useState(companyInfo);
  const [editedWooCommerceKeys, setEditedWooCommerceKeys] = useState(woocommerceApiKeys);
  const fileInputRef = useRef(null);

  useEffect(() => {
    setEditedPurchaseBlockText(purchaseBlockText);
  }, [purchaseBlockText]);

  useEffect(() => {
    setEditedCompanyInfo(companyInfo);
  }, [companyInfo]);

  useEffect(() => {
    setEditedWooCommerceKeys(woocommerceApiKeys);
  }, [woocommerceApiKeys]);

  const handleSavePurchaseBlockText = async () => {
    if (!db || !userId || !appId) {
      showToast('Firebase nije spreman. Molimo pričekajte.', 'error');
      return;
    }
    try {
      const settingsDocRef = doc(db, `artifacts/${appId}/users/${userId}/appSettings/purchaseBlockText`);
      await setDoc(settingsDocRef, { text: editedPurchaseBlockText });
      updatePurchaseBlockText(editedPurchaseBlockText); // Update parent state immediately
      showToast('Tekst otkupnog bloka uspješno ažuriran!', 'success');
    } catch (e) {
      console.error("Error saving purchase block text:", e);
      showToast(`Greška pri spremanju teksta: ${e.message}`, 'error');
    }
  };

  const handleCompanyInfoChange = (e) => {
    const { name, value } = e.target;
    setEditedCompanyInfo(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSaveCompanyInfo = async () => {
    if (!db || !userId || !appId) {
      showToast('Firebase nije spreman. Molimo pričekajte.', 'error');
      return;
    }
    try {
      const companyInfoDocRef = doc(db, `artifacts/${appId}/users/${userId}/appSettings/companyInfo`);
      await setDoc(companyInfoDocRef, editedCompanyInfo);
      updateCompanyInfo(editedCompanyInfo); // Update parent state
      showToast('Podaci tvrtke uspješno ažurirani!', 'success');
    } catch (e) {
      console.error("Error saving company info:", e);
      showToast(`Greška pri spremanju podataka tvrtke: ${e.message}`, 'error');
    }
  };

  const handleWooCommerceKeyChange = (e) => {
    const { name, value } = e.target;
    setEditedWooCommerceKeys(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSaveWooCommerceKeys = async () => {
    if (!db || !userId || !appId) {
      showToast('Firebase nije spreman. Molimo pričekajte.', 'error');
      return;
    }
    try {
      const woocommerceKeysDocRef = doc(db, `artifacts/${appId}/users/${userId}/appSettings/woocommerceKeys`);
      await setDoc(woocommerceKeysDocRef, editedWooCommerceKeys);
      updateWooCommerceApiKeys(editedWooCommerceKeys);
      showToast('WooCommerce API ključevi uspješno spremljeni!', 'success');
    } catch (e) {
      console.error("Error saving WooCommerce keys:", e);
      showToast(`Greška pri spremanju WooCommerce ključeva: ${e.message}`, 'error');
    }
  };


  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const importedData = JSON.parse(e.target.result);
          onImportDevices(importedData);
        } catch (error) {
          console.error("Error parsing JSON file:", error);
          showToast("Greška pri čitanju datoteke. Provjerite je li datoteka ispravan JSON format.", "error");
        }
      };
      reader.readAsText(file);
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-md w-full mx-auto my-6">
      <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">Postavke Aplikacije</h2>

      {/* Purchase Block Text Editor */}
      <div className="mb-8 p-4 border border-blue-200 rounded-lg bg-blue-50">
        <h3 className="text-xl font-semibold text-blue-700 mb-4">Uređivanje Teksta Otkupnog Bloka</h3>
        <textarea
          className="w-full p-3 border border-gray-300 rounded-md resize-y focus:ring-blue-500 focus:border-blue-500 text-sm"
          rows="6"
          value={editedPurchaseBlockText}
          onChange={(e) => setEditedPurchaseBlockText(e.target.value)}
        ></textarea>
        <button
          onClick={handleSavePurchaseBlockText}
          className="mt-4 px-6 py-2 bg-blue-600 text-white font-bold rounded-md hover:bg-blue-700 transition duration-300 shadow-md"
        >
          Spremi Tekst
        </button>
      </div>

      {/* Edit Global Company Info */}
      <div className="mb-8 p-4 border border-orange-200 rounded-lg bg-orange-50">
        <h3 className="text-xl font-semibold text-orange-700 mb-4">Uređivanje Globalnih Podataka Tvrtke</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="block">Ime Tvrtke:
            <input type="text" name="name" value={editedCompanyInfo.name || ''} onChange={handleCompanyInfoChange} className="p-2 border rounded-md w-full text-sm" />
          </label>
          <label className="block">Adresa:
            <input type="text" name="address" value={editedCompanyInfo.address || ''} onChange={handleCompanyInfoChange} className="p-2 border rounded-md w-full text-sm" />
          </label>
          <label className="block">OIB:
            <input type="text" name="oib" value={editedCompanyInfo.oib || ''} onChange={handleCompanyInfoChange} className="p-2 border rounded-md w-full text-sm" />
          </label>
          <label className="block">Telefon:
            <input type="text" name="tel" value={editedCompanyInfo.tel || ''} onChange={handleCompanyInfoChange} className="p-2 border rounded-md w-full text-sm" />
          </label>
          <label className="block md:col-span-2">Email:
            <input type="email" name="email" value={editedCompanyInfo.email || ''} onChange={handleCompanyInfoChange} className="p-2 border rounded-md w-full text-sm" />
          </label>
        </div>
        <button
          onClick={handleSaveCompanyInfo}
          className="mt-4 px-6 py-2 bg-orange-600 text-white font-bold rounded-md hover:bg-orange-700 transition duration-300 shadow-md"
        >
          Spremi Podatke Tvrtke
        </button>
      </div>

      {/* WooCommerce API Keys */}
      <div className="mb-8 p-4 border border-purple-200 rounded-lg bg-purple-50">
        <h3 className="text-xl font-semibold text-purple-700 mb-4">WooCommerce Integracija</h3>
        <p className="text-red-700 bg-red-100 p-3 rounded-md mb-4 text-sm font-semibold">
          <strong className="block text-base mb-1">UPOZORENJE O SIGURNOSTI:</strong> Pohranjivanje WooCommerce API ključeva izravno u frontend aplikaciji
          i izravno pozivanje API-ja iz preglednika **nije preporučeno za produkciju** zbog izlaganja ključeva.
          Za sigurnu i automatsku sinkronizaciju potrebno je implementirati **serverski dio (backend)**, npr. Firebase Cloud Functions.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="block">Consumer Key:
            <input type="password" name="consumerKey" value={editedWooCommerceKeys.consumerKey || ''} onChange={handleWooCommerceKeyChange} className="p-2 border rounded-md w-full text-sm" />
          </label>
          <label className="block">Consumer Secret:
            <input type="password" name="consumerSecret" value={editedWooCommerceKeys.consumerSecret || ''} onChange={handleWooCommerceKeyChange} className="p-2 border rounded-md w-full text-sm" />
          </label>
        </div>
        <button
          onClick={handleSaveWooCommerceKeys}
          className="mt-4 px-6 py-2 bg-purple-600 text-white font-bold rounded-md hover:bg-purple-700 transition duration-300 shadow-md"
        >
          Spremi WooCommerce API Ključeve
        </button>
        <button
          onClick={onTriggerWooCommerceSync}
          className="mt-4 ml-4 px-6 py-2 bg-indigo-600 text-white font-bold rounded-md hover:bg-indigo-700 transition duration-300 shadow-md"
        >
          Pokreni Ručnu Sinkronizaciju Sada
        </button>
      </div>


      {/* Import/Export Devices */}
      <div className="p-4 border border-green-200 rounded-lg bg-green-50">
        <h3 className="text-xl font-semibold text-green-700 mb-4">Uvoz/Izvoz Uređaja</h3>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <button
            onClick={onExportDevices}
            className="px-6 py-2 bg-green-600 text-white font-bold rounded-md hover:bg-green-700 transition duration-300 shadow-md w-full sm:w-auto"
          >
            Izvezi Uređaje (JSON)
          </button>
          <label className="px-6 py-2 bg-purple-600 text-white font-bold rounded-md hover:bg-purple-700 transition duration-300 shadow-md cursor-pointer w-full sm:w-auto text-center">
            Uvezi Uređaje (JSON)
            <input
              type="file"
              accept=".json"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
            />
          </label>
        </div>
      </div>
    </div>
  );
};

// New StatisticsPage Component
const StatisticsPage = ({ devices, employees }) => {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Helper to get start of day, week, month
  const getStartOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const getStartOfWeek = (date) => {
    const d = new Date(date);
    const day = d.getDay(); // Sunday - Saturday : 0 - 6
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Monday start of week (ISO)
    return new Date(d.getFullYear(), d.getMonth(), diff);
  };
  const getStartOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1);

  // New function to calculate summary for a given subset of devices and type (sold or purchased)
  const calculateSubsetSummary = useCallback((devicesSubset, type) => {
    let count = 0;
    let totalMargin = 0;
    const salesByEmployee = {};

    devicesSubset.forEach(device => {
      if (type === 'sold') {
        count++;
        if (typeof device.actualSalePrice === 'number' && typeof device.purchasePrice === 'number' && typeof device.additionalCost === 'number') {
          const margin = device.actualSalePrice - (device.purchasePrice + device.additionalCost);
          if (!isNaN(margin)) {
            totalMargin += margin;
          }
        }
        if (device.soldBy) {
          if (!salesByEmployee[device.soldBy]) {
            salesByEmployee[device.soldBy] = { count: 0, totalMargin: 0 };
          }
          salesByEmployee[device.soldBy].count++;
          if (typeof device.actualSalePrice === 'number' && typeof device.purchasePrice === 'number' && typeof device.additionalCost === 'number') {
              const margin = device.actualSalePrice - (device.purchasePrice + device.additionalCost);
              if (!isNaN(margin)) {
                  salesByEmployee[device.soldBy].totalMargin += margin;
              }
          }
        }
      } else if (type === 'purchased') {
        count++;
      }
    });

    return { count, totalMargin, salesByEmployee };
  }, []);

  // Function to get separate lists for purchased and sold devices within a period
  const getPeriodData = useCallback((period) => {
    const now = new Date();
    let start, end;

    if (period === 'today') {
      start = getStartOfDay(now);
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    } else if (period === 'yesterday') {
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      start = getStartOfDay(yesterday);
      end = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59, 999);
    } else if (period === 'currentWeek') {
      start = getStartOfWeek(now);
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (6 - now.getDay() + (now.getDay() === 0 ? -6 : 1)), 23, 59, 59, 999); // Adjusted for ISO week (Monday start)
    } else if (period === 'custom') {
        start = startDate ? new Date(startDate) : new Date(0); // Start of Unix epoch if no start date
        end = endDate ? new Date(new Date(endDate).setHours(23, 59, 59, 999)) : now;
    } else { // All time
        start = new Date(0); // Very old date
        end = now;
    }

    const purchasedInPeriod = devices.filter(device => {
      const purchaseDeviceDate = device.purchaseDate ? new Date(device.purchaseDate) : null;
      return purchaseDeviceDate && purchaseDeviceDate >= start && purchaseDeviceDate <= end;
    });

    const soldInPeriod = devices.filter(device => {
      const saleDeviceDate = device.status === 'Prodan' && device.timestamp ? new Date(device.timestamp) : null;
      return saleDeviceDate && saleDeviceDate >= start && saleDeviceDate <= end;
    });

    return { purchasedInPeriod, soldInPeriod };
  }, [devices, startDate, endDate]);

  // Calculate stats for Today
  const todayData = useMemo(() => getPeriodData('today'), [getPeriodData]);
  const todaySalesStats = useMemo(() => calculateSubsetSummary(todayData.soldInPeriod, 'sold'), [calculateSubsetSummary, todayData.soldInPeriod]);
  const todayPurchaseStats = useMemo(() => calculateSubsetSummary(todayData.purchasedInPeriod, 'purchased'), [calculateSubsetSummary, todayData.purchasedInPeriod]);

  // Calculate stats for Yesterday
  const yesterdayData = useMemo(() => getPeriodData('yesterday'), [getPeriodData]);
  const yesterdaySalesStats = useMemo(() => calculateSubsetSummary(yesterdayData.soldInPeriod, 'sold'), [calculateSubsetSummary, yesterdayData.soldInPeriod]);
  const yesterdayPurchaseStats = useMemo(() => calculateSubsetSummary(yesterdayData.purchasedInPeriod, 'purchased'), [calculateSubsetSummary, yesterdayData.purchasedInPeriod]);

  // Calculate stats for Current Week
  const currentWeekData = useMemo(() => getPeriodData('currentWeek'), [getPeriodData]);
  const currentWeekSalesStats = useMemo(() => calculateSubsetSummary(currentWeekData.soldInPeriod, 'sold'), [calculateSubsetSummary, currentWeekData.soldInPeriod]);
  const currentWeekPurchaseStats = useMemo(() => calculateSubsetSummary(currentWeekData.purchasedInPeriod, 'purchased'), [calculateSubsetSummary, currentWeekData.purchasedInPeriod]);

  // Calculate stats for Custom Range
  const customRangeData = useMemo(() => {
    if (!startDate || !endDate) return { purchasedInPeriod: [], soldInPeriod: [] };
    return getPeriodData('custom');
  }, [getPeriodData, startDate, endDate]);
  const customRangeSalesStats = useMemo(() => calculateSubsetSummary(customRangeData.soldInPeriod, 'sold'), [calculateSubsetSummary, customRangeData.soldInPeriod]);
  const customRangePurchaseStats = useMemo(() => calculateSubsetSummary(customRangeData.purchasedInPeriod, 'purchased'), [calculateSubsetSummary, customRangeData.purchasedInPeriod]);

  // Overall sales by employee (uses all devices, not period filtered)
  const overallSalesByEmployee = useMemo(() => {
    let salesByEmployee = {};
    devices.forEach(device => {
      if (device.status === 'Prodan' && device.soldBy) {
        if (!salesByEmployee[device.soldBy]) {
          salesByEmployee[device.soldBy] = { count: 0, totalMargin: 0 };
        }
        salesByEmployee[device.soldBy].count++;
        if (typeof device.actualSalePrice === 'number' && typeof device.purchasePrice === 'number' && typeof device.additionalCost === 'number') {
            const margin = device.actualSalePrice - (device.purchasePrice + device.additionalCost);
            if (!isNaN(margin)) {
                salesByEmployee[device.soldBy].totalMargin += margin;
            }
        }
      }
    });
    return salesByEmployee;
  }, [devices]);


  return (
    <div className="bg-white p-6 rounded-lg shadow-md w-full mx-auto my-6">
      <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">Statistika Prodaje i Zaliha</h2>

      {/* Quick Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-blue-50 p-6 rounded-lg shadow-sm border border-blue-200 text-center">
          <h3 className="text-xl font-semibold text-blue-700 mb-2">Danas</h3>
          <p className="text-gray-800"><span className="font-bold">{todaySalesStats.count}</span> prodanih uređaja</p>
          <p className="text-gray-800"><span className="font-bold">{todayPurchaseStats.count}</span> otkupljenih uređaja</p>
          <p className="text-gray-800">Ostvarena marža: <span className="font-bold">{todaySalesStats.totalMargin.toFixed(2)}€</span></p>
        </div>
        <div className="bg-blue-50 p-6 rounded-lg shadow-sm border border-blue-200 text-center">
          <h3 className="text-xl font-semibold text-blue-700 mb-2">Jučer</h3>
          <p className="text-gray-800"><span className="font-bold">{yesterdaySalesStats.count}</span> prodanih uređaja</p>
          <p className="text-gray-800"><span className="font-bold">{yesterdayPurchaseStats.count}</span> otkupljenih uređaja</p>
          <p className="text-gray-800">Ostvarena marža: <span className="font-bold">{yesterdaySalesStats.totalMargin.toFixed(2)}€</span></p>
        </div>
        <div className="bg-blue-50 p-6 rounded-lg shadow-sm border border-blue-200 text-center">
          <h3 className="text-xl font-semibold text-blue-700 mb-2">Tekući Tjedan</h3>
          <p className="text-gray-800"><span className="font-bold">{currentWeekSalesStats.count}</span> prodanih uređaja</p>
          <p className="text-gray-800"><span className="font-bold">{currentWeekPurchaseStats.count}</span> otkupljenih uređaja</p>
          <p className="text-gray-800">Ostvarena marža: <span className="font-bold">{currentWeekSalesStats.totalMargin.toFixed(2)}€</span></p>
        </div>
      </div>

      {/* Custom Date Range Filter */}
      <div className="mb-8 p-4 border border-gray-200 rounded-lg bg-gray-50">
        <h3 className="text-xl font-semibold text-gray-700 mb-4">Filtriranje po Datumu</h3>
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-grow">
            <label htmlFor="startDate" className="block text-sm font-medium text-gray-700 mb-1">Datum od:</label>
            <input
              type="date"
              id="startDate"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="p-2 border border-gray-300 rounded-md w-full"
            />
          </div>
          <div className="flex-grow">
            <label htmlFor="endDate" className="block text-sm font-medium text-gray-700 mb-1">Datum do:</label>
            <input
              type="date"
              id="endDate"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="p-2 border border-gray-300 rounded-md w-full"
            />
          </div>
          <button
            onClick={() => { setStartDate(''); setEndDate(''); }}
            className="px-4 py-2 bg-gray-300 text-gray-800 font-bold rounded-md hover:bg-gray-400 transition duration-300"
          >
            Poništi
          </button>
        </div>
        {startDate && endDate && (
          <div className="mt-6 p-4 bg-purple-50 rounded-lg border border-purple-200">
            <h4 className="text-lg font-semibold text-purple-700 mb-2">Statistika za odabrani raspon:</h4>
            <p className="text-gray-800"><span className="font-bold">{customRangeSalesStats.count}</span> prodanih uređaja</p>
            <p className="text-gray-800"><span className="font-bold">{customRangePurchaseStats.count}</span> otkupljenih uređaja</p>
            <p className="text-gray-800">Ostvarena marža: <span className="font-bold">{customRangeSalesStats.totalMargin.toFixed(2)}€</span></p>
          </div>
        )}
      </div>


      {/* Overall Counts */}
      <div className="mb-8 p-4 border border-green-200 rounded-lg bg-green-50">
        <h3 className="text-xl font-semibold text-green-700 mb-4">Ukupni Pregled Uređaja (Sveukupno)</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
          <div className="p-3 bg-white rounded-md shadow-sm">
            <p className="text-lg font-semibold">Ukupno Otkupljeno (u bazi):</p>
            <p className="text-2xl font-bold text-green-700">{devices.length}</p>
          </div>
          <div className="p-3 bg-white rounded-md shadow-sm">
            <p className="text-lg font-semibold">Ukupno Prodano:</p>
            <p className="text-2xl font-bold text-red-700">{devices.filter(d => d.status === 'Prodan').length}</p>
          </div>
          <div className="p-3 bg-white rounded-md shadow-sm">
            <p className="text-lg font-semibold">Ukupno Rezervirano:</p>
            <p className="text-2xl font-bold text-yellow-700">{devices.filter(d => d.status === 'Rezerviran').length}</p>
          </div>
          <div className="p-3 bg-white rounded-md shadow-sm">
            <p className="text-lg font-semibold">Ukupna Ostvarena Marža (svi prodani):</p>
            <p className="text-2xl font-bold text-blue-700">
              {overallSalesByEmployee ? Object.values(overallSalesByEmployee).reduce((sum, item) => sum + item.totalMargin, 0).toFixed(2) : '0.00'}€
            </p>
          </div>
        </div>
      </div>

      {/* Sales by Employee */}
      <div className="mb-8 p-4 border border-indigo-200 rounded-lg bg-indigo-50">
        <h3 className="text-xl font-semibold text-indigo-700 mb-4">Prodaja po Djelatniku (Sveukupno)</h3>
        {Object.keys(overallSalesByEmployee).length === 0 ? (
          <p className="text-gray-500">Nema evidentirane prodaje po djelatnicima.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-indigo-200">
              <thead className="bg-indigo-100">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-indigo-700 uppercase tracking-wider rounded-tl-lg">Djelatnik</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-indigo-700 uppercase tracking-wider">Broj Prodaja</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-indigo-700 uppercase tracking-wider rounded-tr-lg">Ukupna Marža (€)</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-indigo-200">
                {Object.entries(overallSalesByEmployee).map(([employeeName, data]) => (
                  <tr key={employeeName}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{employeeName}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{data.count}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{data.totalMargin.toFixed(2)}€</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
};


// Main application component
export default function App() {
  const today = new Date().toISOString().slice(0, 10);

  // Firebase state
  const [firebaseApp, setFirebaseApp] = useState(null);
  const [auth, setAuth] = useState(null);
  const [db, setDb] = useState(null);
  // Uklonjen state za Cloud Functions jer sada koristimo Netlify Functions
  // const [functions, setFunctions] = useState(null); 
  const [userId, setUserId] = useState(null);
  const [appId, setAppId] = useState(null);
  const [loadingFirebase, setLoadingFirebase] = useState(true);
  const [firebaseError, setFirebaseError] = useState(null);
  const [isAuthorizedUser, setIsAuthorizedUser] = useState(false);

  // State for the currently active tab
  const [activeTab, setActiveTab] = useState('inventory');
  const [selectedDeviceId, setSelectedDeviceId] = useState(null);
  const [infoModalMessage, setInfoModalMessage] = useState('');
  const [infoModalType, setInfoModalType] = useState('info');

  // States for data fetched from Firestore
  const [devices, setDevices] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [newEmployeeName, setNewEmployeeName] = useState('');

  // State for login form
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState(''); // Inicijalizirano kao prazan string


  // State for the next available order number
  const [nextOrderNumber, setNextOrderNumber] = useState(1);
  // State for the editable purchase block text
  const [purchaseBlockText, setPurchaseBlockText] = useState("Svojim potpisom dajem privolu MCloud j.d.o.o. za prikupljanje i obradu mojih podataka u svrhu otkupa mobitela kao i suglasnost za čuvanje mojih podataka u arhivi otkupljenih uređaja.");
  // State for company global information
  const [companyInfo, setCompanyInfo] = useState({
    name: "Mcloud j.d.o.o.",
    address: "Ul. Stjepana Radića 48A, 31000, Osijek",
    oib: "28129876103",
    tel: "+385 98 606 855",
    email: "alphaservis@alphaservis.com"
  });

  // State for WooCommerce API keys
  const [woocommerceApiKeys, setWooCommerceApiKeys] = useState({
    consumerKey: '',
    consumerSecret: '',
  });


  // State for filters and sorting
  const [filters, setFilters] = useState({
    imei: '',
    forWeb: '',
    brand: '',
    model: '',
    color: '',
    storageGB: '',
    status: '',
    condition: '',
    purchaseDateStart: '',
    purchaseDateEnd: '',
    wooCommerceIdMissing: false, // New filter state
  });
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'ascending' });

  // State for new device data in the form (Physical Purchase)
  const [newPhysicalPurchaseDevice, setNewPhysicalPurchaseDevice] = useState({
    brand: '',
    model: '',
    color: '',
    storageGB: '',
    purchaseDate: today,
    condition: 'Novo',
    warranty: false,
    warrantyEndDate: '',
    purchasePrice: '',
    actualSalePrice: 0,
    additionalCost: 0,
    imei: '',
    personWhoSold: '',
    oibWhoSold: '',
    personAddress: '',
    personName: '',
    testedBy: '',
    wooCommerceId: '',
    forWeb: false,
    notes: [],
    soldBy: '', // New field for employee who sold the device
  });

  // State for new device data in the form (Web Purchase)
  const [newWebPurchaseDevice, setNewWebPurchaseDevice] = useState({
    brand: '',
    model: '',
    color: '',
    storageGB: '',
    imei: '',
    condition: 'Novo',
    purchasePrice: '',
    actualSalePrice: 0,
    additionalCost: 0,
    forWeb: true,
    wooCommerceId: '',
    notes: [],
    soldBy: '', // New field for employee who sold the device
  });


  // Template search state for Physical Purchase
  const [physicalPurchaseTemplateSearchQuery, setPhysicalPurchaseTemplateSearchQuery] = useState('');
  const [filteredPhysicalPurchaseTemplateDevices, setFilteredPhysicalPurchaseTemplateDevices] = useState([]);

  // Template search state for Web Purchase (main form)
  const [webPurchaseTemplateSearchQuery, setWebPurchaseTemplateSearchQuery] = useState('');
  const [filteredWebPurchaseTemplateDevices, setFilteredWebPurchaseTemplateDevices] = useState([]);

  // State for all inputs in the unique devices table in Web Purchase
  const [uniqueDeviceRowData, setUniqueDeviceRowData] = useState({});
  // State for search in the unique devices table in Web Purchase
  const [uniqueDeviceTableSearchQuery, setUniqueDeviceTableSearchQuery] = useState('');

  // Function to show toast messages
  const showToast = useCallback((message, type = 'info') => {
    console.log("Pokazuje toast obavijest:", message, type);
    setInfoModalMessage(message);
    setInfoModalType(type);
  }, []);

  // --- Firebase Initialization Effect ---
  useEffect(() => {
    const setupFirebase = async () => {
      try {
        const firebaseConfig = typeof __firebase_config !== 'undefined'
          ? JSON.parse(__firebase_config)
          : {
              apiKey: "AIzaSyA3W4sxBAnKpMZiEVNRv-IURB5Rr1sk67E",
              authDomain: "alphamanager-c2ca9.firebaseapp.com",
              projectId: "alphamanager-c2ca9",
              storageBucket: "alphamanager-c2ca9.firebasestorage.app",
              messagingSenderId: "637524389705",
              appId: "1:637524389705:web:c846183ca73854e2eaf498"
            };

        const app = initializeApp(firebaseConfig);
        const authInstance = getAuth(app);
        const dbInstance = getFirestore(app);
        // Uklonjena inicijalizacija za Cloud Functions
        // const functionsInstance = getFunctions(app); 
        // Ako želite testirati funkcije lokalno s Emulator Suiteom (za razvoj):
        // import { connectFunctionsEmulator } from "firebase/functions";
        // if (process.env.NODE_ENV === 'development') {
        //   connectFunctionsEmulator(functionsInstance, 'localhost', 5001); // Zadana porta za funkcije emulator
        // }


        setFirebaseApp(app);
        setAuth(authInstance);
        setDb(dbInstance);
        // Uklonjeno spremanje instance funkcija u state
        // setFunctions(functionsInstance); 

        const currentAppId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
        setAppId(currentAppId);

        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(authInstance, __initial_auth_token);
        }

        const unsubscribe = onAuthStateChanged(authInstance, (user) => {
          if (user) {
            if (user.email === AUTHORIZED_EMAIL) {
              setUserId(user.uid);
              setIsAuthorizedUser(true);
              setLoginError('');
              console.log("Firebase user signed in and authorized:", user.uid);
            } else {
              signOut(authInstance);
              setUserId(null);
              setIsAuthorizedUser(false);
              setLoginError('Nemate ovlaštenje za pristup aplikaciji. Molimo prijavite se s ovlaštenim računom.');
              console.log("Unauthorized user signed out:", user.email);
            }
          } else {
            setUserId(null);
            setIsAuthorizedUser(false);
            console.log("Firebase user signed out.");
          }
          setLoadingFirebase(false);
        });

        return () => unsubscribe();

      } catch (e) {
        console.error("Error initializing Firebase:", e);
        setFirebaseError("Failed to initialize Firebase. Check console for details.");
        setLoadingFirebase(false);
      }
    };

    setupFirebase();
  }, []);

  // --- Firestore Data Fetching Effects ---
  useEffect(() => {
    if (!db || !userId || !appId || !isAuthorizedUser) return;

    const devicesCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/devices`);
    const q = query(devicesCollectionRef);

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const devicesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setDevices(devicesData);
      console.log("Fetched devices from Firestore:", devicesData.length);
    }, (error) => {
      console.error("Error fetching devices:", error);
      showToast(`Greška pri dohvatu uređaja: ${error.message}`, 'error');
    });

    return () => unsubscribe();
  }, [db, userId, appId, isAuthorizedUser, showToast]);

  useEffect(() => {
    if (!db || !userId || !appId || !isAuthorizedUser) return;

    const employeesCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/employees`);
    const q = query(employeesCollectionRef);

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const employeesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setEmployees(employeesData);
      console.log("Fetched employees from Firestore:", employeesData.length);
    }, (error) => {
      console.error("Error fetching employees:", error);
      showToast(`Greška pri dohvatu djelatnika: ${error.message}`, 'error');
    });

    return () => unsubscribe();
  }, [db, userId, appId, isAuthorizedUser, showToast]);

  useEffect(() => {
    if (!db || !userId || !appId || !isAuthorizedUser) return;

    const orderNumberDocRef = doc(db, `artifacts/${appId}/users/${userId}/appSettings/orderNumber`);

    const unsubscribe = onSnapshot(orderNumberDocRef, (docSnap) => {
      if (docSnap.exists()) {
        setNextOrderNumber(docSnap.data().lastOrderNumber + 1);
      } else {
        setDoc(orderNumberDocRef, { lastOrderNumber: 0 });
        setNextOrderNumber(1);
      }
    }, (error) => {
      console.error("Error fetching order number:", error);
      showToast(`Greška pri dohvatu broja naloga: ${error.message}`, 'error');
    });

    return () => unsubscribe();
  }, [db, userId, appId, isAuthorizedUser, showToast]);

  // Effect to fetch purchase block text
  useEffect(() => {
    if (!db || !userId || !appId || !isAuthorizedUser) return;

    const purchaseBlockTextDocRef = doc(db, `artifacts/${appId}/users/${userId}/appSettings/purchaseBlockText`);

    const unsubscribe = onSnapshot(purchaseBlockTextDocRef, (docSnap) => {
      if (docSnap.exists()) {
        setPurchaseBlockText(docSnap.data().text);
      } else {
        setDoc(purchaseBlockTextDocRef, { text: "Svojim potpisom dajem privolu MCloud j.d.o.o. za prikupljanje i obradu mojih podataka u svrhu otkupa mobitela kao i suglasnost za čuvanje mojih podataka u arhivi otkupljenih uređaja." });
      }
    }, (error) => {
      console.error("Error fetching purchase block text:", error);
      showToast(`Greška pri dohvatu teksta otkupnog bloka: ${error.message}`, 'error');
    });

    return () => unsubscribe();
  }, [db, userId, appId, isAuthorizedUser, showToast]);

  // Effect to fetch company info
  useEffect(() => {
    if (!db || !userId || !appId || !isAuthorizedUser) return;

    const companyInfoDocRef = doc(db, `artifacts/${appId}/users/${userId}/appSettings/companyInfo`);

    const unsubscribe = onSnapshot(companyInfoDocRef, (docSnap) => {
      if (docSnap.exists()) {
        setCompanyInfo(docSnap.data());
      } else {
        // Initialize with default values if document doesn't exist
        setDoc(companyInfoDocRef, {
          name: "Mcloud j.d.o.o.",
          address: "Ul. Stjepana Radića 48A, 31000, Osijek",
          oib: "28129876103",
          tel: "+385 98 606 855",
          email: "alphaservis@alphaservis.com"
        });
      }
    }, (error) => {
      console.error("Error fetching company info:", error);
      showToast(`Greška pri dohvatu podataka tvrtke: ${error.message}`, 'error');
    });

    return () => unsubscribe();
  }, [db, userId, appId, isAuthorizedUser, showToast]);

  // Effect to fetch WooCommerce API Keys
  useEffect(() => {
    if (!db || !userId || !appId || !isAuthorizedUser) return;

    const woocommerceKeysDocRef = doc(db, `artifacts/${appId}/users/${userId}/appSettings/woocommerceKeys`);

    const unsubscribe = onSnapshot(woocommerceKeysDocRef, (docSnap) => {
      if (docSnap.exists()) {
        setWooCommerceApiKeys(docSnap.data());
      } else {
        // Initialize with empty values if document doesn't exist
        setDoc(woocommerceKeysDocRef, { consumerKey: '', consumerSecret: '' });
      }
    }, (error) => {
      console.error("Error fetching WooCommerce keys:", error);
      showToast(`Greška pri dohvatu WooCommerce ključeva: ${error.message}`, 'error');
    });

    return () => unsubscribe();
  }, [db, userId, appId, isAuthorizedUser, showToast]);


  // Handle search for templates (Physical Purchase)
  useEffect(() => {
    if (physicalPurchaseTemplateSearchQuery.length > 2) {
      const query = physicalPurchaseTemplateSearchQuery.toLowerCase();
      const seenKeys = new Set();
      const uniqueTemplates = devices.filter(device => {
        const key = `${device.brand}-${device.model}-${device.color}-${device.storageGB}-${device.condition}`;
        if (seenKeys.has(key)) {
          return false;
        }
        seenKeys.add(key);
        return true;
      });
      setFilteredPhysicalPurchaseTemplateDevices(
        uniqueTemplates.filter(d =>
          d.brand.toLowerCase().includes(query) || d.model.toLowerCase().includes(query) || (d.color && d.color.toLowerCase().includes(query)) || (d.storageGB && d.storageGB.includes(query))
        )
      );
    } else {
      setFilteredPhysicalPurchaseTemplateDevices([]);
    }
  }, [physicalPurchaseTemplateSearchQuery, devices]);

  // Handle search for templates (Web Purchase - main form)
  useEffect(() => {
    if (webPurchaseTemplateSearchQuery.length > 2) {
      const query = webPurchaseTemplateSearchQuery.toLowerCase();
      const seenKeys = new Set();
      const uniqueTemplates = devices.filter(device => {
        const key = `${device.model}-${device.color}-${device.storageGB}`;
        if (seenKeys.has(key)) {
          return false;
        }
        seenKeys.add(key);
        return true;
      });
      setFilteredWebPurchaseTemplateDevices(
        uniqueTemplates.filter(d =>
          d.brand.toLowerCase().includes(query) || d.model.toLowerCase().includes(query) || (d.color && d.color.toLowerCase().includes(query)) || (d.storageGB && d.storageGB.includes(query))
        )
      );
    } else {
      setFilteredWebPurchaseTemplateDevices([]);
    }
  }, [webPurchaseTemplateSearchQuery, devices]);


  const getUniqueDeviceTemplates = () => {
    const uniqueMap = new Map();
    devices.forEach(device => {
      const key = `${device.brand}-${device.model}-${device.color}-${device.storageGB}`;
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, {
          templateId: key,
          brand: device.brand,
          model: device.model,
          color: device.color,
          storageGB: device.storageGB,
        });
      }
    });
    return Array.from(uniqueMap.values());
  };

  const filteredUniqueDeviceTemplates = getUniqueDeviceTemplates().filter(template => {
    const query = uniqueDeviceTableSearchQuery.toLowerCase();
    return template.brand.toLowerCase().includes(query) ||
           template.model.toLowerCase().includes(query) ||
           (template.color && template.color.toLowerCase().includes(query)) ||
           (template.storageGB && template.storageGB.includes(query));
  });

  // This useEffect initializes or updates uniqueDeviceRowData based on 'devices' changes.
  useEffect(() => {
    if (!devices.length && Object.keys(uniqueDeviceRowData).length) {
      setUniqueDeviceRowData({});
      return;
    }

    const currentTemplates = getUniqueDeviceTemplates();
    const newRowDataState = { ...uniqueDeviceRowData };

    currentTemplates.forEach(template => {
      const matchingDevices = devices.filter(d =>
        d.brand === template.brand &&
        d.model === template.model &&
        d.color === template.color &&
        d.storageGB === template.storageGB
      );

      let bestWooCommerceId = '';
      let bestForWeb = false;
      let bestCondition = 'Novo';

      const webEnabledDevice = matchingDevices.find(d => d.forWeb && d.wooCommerceId);
      if (webEnabledDevice) {
        bestWooCommerceId = webEnabledDevice.wooCommerceId;
        bestForWeb = true;
        bestCondition = webEnabledDevice.condition;
      } else {
        const deviceWithWooId = matchingDevices.find(d => d.wooCommerceId);
        if (deviceWithWooId) {
          bestWooCommerceId = deviceWithWooId.wooCommerceId;
          bestForWeb = deviceWithWooId.forWeb;
          bestCondition = deviceWithWooId.condition;
        } else {
          const novoDevice = matchingDevices.find(d => d.condition === 'Novo');
          if (novoDevice) {
            bestWooCommerceId = novoDevice.wooCommerceId || '';
            bestForWeb = novoDevice.forWeb;
            bestCondition = 'Novo';
          } else {
            const rabljenoDevice = matchingDevices.find(d => d.condition === 'Rabljeno');
            if (rabljenoDevice) {
              bestWooCommerceId = rabljenoDevice.wooCommerceId || '';
              bestForWeb = rabljenoDevice.forWeb;
              bestCondition = 'Rabljeno';
            }
          }
        }
      }

      // Initialize template data if not already present or if specific fields are empty
      if (newRowDataState[template.templateId] === undefined) {
        newRowDataState[template.templateId] = {};
      }

      // Only set values if they are currently undefined or match initial empty values
      if (newRowDataState[template.templateId].condition === undefined) {
          newRowDataState[template.templateId].condition = bestCondition;
      }
      if (newRowDataState[template.templateId].purchasePrice === undefined || newRowDataState[template.templateId].purchasePrice === null || newRowDataState[template.templateId].purchasePrice === 0) {
        const matchingDeviceForPrice = matchingDevices.find(d => d.condition === bestCondition);
        newRowDataState[template.templateId].purchasePrice = (matchingDeviceForPrice ? matchingDeviceForPrice.purchasePrice || 0 : 0);
      }
      if (newRowDataState[template.templateId].wooCommerceId === undefined || newRowDataState[template.templateId].wooCommerceId === '') {
        newRowDataState[template.templateId].wooCommerceId = bestWooCommerceId;
      }
      if (newRowDataState[template.templateId].forWeb === undefined) {
        newRowDataState[template.templateId].forWeb = bestForWeb;
      }
      if (newRowDataState[template.templateId].imei === undefined) {
          newRowDataState[template.templateId].imei = '';
      }
      if (newRowDataState[template.templateId].actualSalePrice === undefined) {
          newRowDataState[template.templateId].actualSalePrice = '';
      }
      if (newRowDataState[template.templateId].additionalCost === undefined) {
          newRowDataState[template.templateId].additionalCost = 0;
      }
      if (newRowDataState[template.templateId].notes === undefined) {
          newRowDataState[template.templateId].notes = [];
      }
      // Ensure soldBy is initialized for unique devices table
      if (newRowDataState[template.templateId].soldBy === undefined) {
          newRowDataState[template.templateId].soldBy = '';
      }
    });

    // Remove templates that no longer exist in 'devices'
    Object.keys(newRowDataState).forEach(templateId => {
      if (!currentTemplates.some(t => t.templateId === templateId)) {
        delete newRowDataState[templateId];
      }
    });

    // Only update if there's a real difference to avoid unnecessary re-renders
    if (JSON.stringify(newRowDataState) !== JSON.stringify(uniqueDeviceRowData)) {
      setUniqueDeviceRowData(newRowDataState);
    }
  }, [devices, uniqueDeviceRowData]); // Added uniqueDeviceRowData back to dependencies, as it needs to react to changes


  const handleNewPhysicalPurchaseDeviceChange = (e) => {
    const { name, value, type, checked } = e.target;
    setNewPhysicalPurchaseDevice(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleAddPhysicalPurchaseDevice = async () => {
    if (!db || !userId || !appId) {
      showToast('Firebase nije spreman. Molimo pričekajte.', 'error');
      return;
    }
    if (!newPhysicalPurchaseDevice.brand || !newPhysicalPurchaseDevice.model) {
      showToast('Marka i Model su obavezna polja.', 'error');
      return;
    }

    try {
      const orderNumberDocRef = doc(db, `artifacts/${appId}/users/${userId}/appSettings/orderNumber`);
      let currentOrderNumber;

      await runTransaction(db, async (transaction) => {
        const docSnap = await transaction.get(orderNumberDocRef);
        if (docSnap.exists()) {
          currentOrderNumber = docSnap.data().lastOrderNumber + 1;
        } else {
          currentOrderNumber = 1;
        }
        transaction.set(orderNumberDocRef, { lastOrderNumber: currentOrderNumber });
      });

      const formattedOrderNumber = `OTK-${String(currentOrderNumber).padStart(6, '0')}`;

      const deviceToAdd = {
        ...newPhysicalPurchaseDevice,
        purchasePrice: parseFloat(newPhysicalPurchaseDevice.purchasePrice) || 0,
        actualSalePrice: 0,
        additionalCost: 0,
        marginEuro: '0.00€',
        marginPercent: '0.00%',
        status: 'Na stanju',
        notes: [],
        timestamp: new Date().toISOString(),
        orderNumber: formattedOrderNumber,
        soldBy: '', // Ensure soldBy is empty on new purchase
      };

      await addDoc(collection(db, `artifacts/${appId}/users/${userId}/devices`), deviceToAdd);
      showToast('Uređaj (Fizička osoba) uspješno dodan!', 'success');
      setNewPhysicalPurchaseDevice({
        brand: '', model: '', color: '', storageGB: '', purchaseDate: today, condition: 'Novo', warranty: false, warrantyEndDate: '',
        purchasePrice: '', actualSalePrice: 0, additionalCost: 0, imei: '', personWhoSold: '', oibWhoSold: '', personAddress: '', personName: '',
        testedBy: '',
        wooCommerceId: '', forWeb: false, notes: [], soldBy: '',
      });
      setPhysicalPurchaseTemplateSearchQuery('');
      setActiveTab('inventory');
    } catch (e) {
      console.error("Error adding physical purchase device: ", e);
      showToast(`Greška pri dodavanju uređaja: ${e.message}`, 'error');
    }
  };

  const handleNewWebPurchaseDeviceChange = (e) => {
    const { name, value, type, checked } = e.target;
    setNewWebPurchaseDevice(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleAddWebPurchaseDevice = async () => {
    if (!db || !userId || !appId) {
      showToast('Firebase nije spreman. Molimo pričekajte.', 'error');
      return;
    }
    if (!newWebPurchaseDevice.brand || !newWebPurchaseDevice.model || !newWebPurchaseDevice.imei) {
      showToast('Marka, Model i IMEI/Serijski broj su obavezna polja.', 'error');
      return;
    }

    try {
      const orderNumberDocRef = doc(db, `artifacts/${appId}/users/${userId}/appSettings/orderNumber`);
      let currentOrderNumber;

      await runTransaction(db, async (transaction) => {
        const docSnap = await transaction.get(orderNumberDocRef);
        if (docSnap.exists()) {
          currentOrderNumber = docSnap.data().lastOrderNumber + 1;
        } else {
          currentOrderNumber = 1;
        }
        transaction.set(orderNumberDocRef, { lastOrderNumber: currentOrderNumber });
      });

      const formattedOrderNumber = `OTK-${String(currentOrderNumber).padStart(6, '0')}`;


      const deviceToAdd = {
        ...newWebPurchaseDevice,
        purchasePrice: parseFloat(newWebPurchaseDevice.purchasePrice) || 0,
        actualSalePrice: 0,
        additionalCost: 0,
        marginEuro: '0.00€',
        marginPercent: '0.00%',
        status: 'Na stanju',
        purchaseDate: new Date().toISOString().slice(0, 10),
        warranty: false,
        warrantyEndDate: '',
        personWhoSold: 'Web Izvor',
        oibWhoSold: '-',
        personAddress: '',
        personName: '',
        testedBy: '',
        notes: [],
        timestamp: new Date().toISOString(),
        orderNumber: formattedOrderNumber,
        soldBy: '', // Ensure soldBy is empty on new purchase
      };

      await addDoc(collection(db, `artifacts/${appId}/users/${userId}/devices`), deviceToAdd);
      showToast('Uređaj (Web otkup) uspješno dodan!', 'success');
      setNewWebPurchaseDevice({
        brand: '', model: '', color: '', storageGB: '', imei: '', condition: 'Novo', purchasePrice: '', actualSalePrice: 0,
        additionalCost: 0, forWeb: true, wooCommerceId: '', notes: [], soldBy: '',
      });
      setWebPurchaseTemplateSearchQuery('');
      setActiveTab('inventory');
    } catch (e) {
      console.error("Error adding web purchase device: ", e);
      showToast(`Greška pri dodavanju uređaja: ${e.message}`, 'error');
    }
  };

  const handleUniqueDeviceInputChange = (templateId, field, value) => {
    setUniqueDeviceRowData(prev => {
      const newState = { ...prev };
      const currentEntry = newState[templateId] || {};

      newState[templateId] = {
        ...currentEntry,
        [field]: value
      };

      if (field === 'condition') {
        const [brand, model, color, storageGB] = templateId.split('-');
        // Find a matching device that matches the template's characteristics AND the NEWLY selected condition
        const matchingDeviceByNewCondition = devices.find(d =>
          d.brand === brand && d.model === model && d.color === color && d.storageGB === storageGB && d.condition === value
        );

        if (matchingDeviceByNewCondition) {
          // If a matching device is found, populate the WooCommerce ID, purchase price, and forWeb from it
          newState[templateId].wooCommerceId = matchingDeviceByNewCondition.wooCommerceId || '';
          newState[templateId].purchasePrice = matchingDeviceByNewCondition.purchasePrice || 0;
          newState[templateId].forWeb = matchingDeviceByNewCondition.forWeb !== undefined ? matchingDeviceByNewCondition.forWeb : false;
        } else {
          // If no matching device found for the new condition, clear these fields
          newState[templateId].wooCommerceId = '';
          newState[templateId].purchasePrice = 0;
          newState[templateId].forWeb = false;
        }
      }
      return newState;
    });
  };

  const handleAddUniqueDeviceFromTable = async (template) => {
    if (!db || !userId || !appId) {
      showToast('Firebase nije spreman. Molimo pričekajte.', 'error');
      return;
    }
    const rowData = uniqueDeviceRowData[template.templateId] || {};
    const imei = rowData.imei;

    if (!imei) {
      showToast('Molimo unesite IMEI/Serijski broj za odabrani uređaj.', 'error');
      return;
    }
    if (!template.brand || !template.model) {
      showToast('Predložak nema definiranu Marku ili Model. Nije moguće dodati uređaj.', 'error');
      return;
    }

    try {
      const orderNumberDocRef = doc(db, `artifacts/${appId}/users/${userId}/appSettings/orderNumber`);
      let currentOrderNumber;

      await runTransaction(db, async (transaction) => {
        const docSnap = await transaction.get(orderNumberDocRef);
        if (docSnap.exists()) {
          currentOrderNumber = docSnap.data().lastOrderNumber + 1;
        } else {
          currentOrderNumber = 1;
        }
        transaction.set(orderNumberDocRef, { lastOrderNumber: currentOrderNumber });
      });

      const formattedOrderNumber = `OTK-${String(currentOrderNumber).padStart(6, '0')}`;

      const deviceToAdd = {
        brand: template.brand,
        model: template.model,
        color: template.color,
        storageGB: template.storageGB,
        imei: imei,
        condition: rowData.condition !== undefined ? rowData.condition : 'Novo',
        purchasePrice: parseFloat(rowData.purchasePrice) || 0,
        actualSalePrice: parseFloat(rowData.actualSalePrice) || 0,
        additionalCost: parseFloat(rowData.additionalCost) || 0,
        forWeb: rowData.forWeb !== undefined ? rowData.forWeb : false,
        wooCommerceId: rowData.wooCommerceId !== undefined ? rowData.wooCommerceId : '',
        status: 'Na stanju',
        marginEuro: '',
        marginPercent: '',
        purchaseDate: new Date().toISOString().slice(0, 10),
        warranty: false,
        warrantyEndDate: '',
        personWhoSold: 'Web Izvor',
        oibWhoSold: '-',
        personAddress: '',
        personName: '',
        testedBy: '',
        notes: [],
        timestamp: new Date().toISOString(),
        orderNumber: formattedOrderNumber,
        soldBy: '', // Ensure soldBy is empty on new purchase
      };

      await addDoc(collection(db, `artifacts/${appId}/users/${userId}/devices`), deviceToAdd);
      showToast('Uređaj dodan iz predloška!', 'success');
      setUniqueDeviceRowData(prev => {
        const newState = { ...prev };
        let bestMatchDevice = devices.find(d =>
          d.brand === template.brand && d.model === template.model && d.color === template.color && d.storageGB === template.storageGB && d.condition === 'Novo'
        );
        if (!bestMatchDevice) {
          bestMatchDevice = devices.find(d =>
            d.brand === template.brand && d.model === template.model && d.color === template.color && d.storageGB === template.storageGB && d.condition === 'Rabljeno'
          );
        }

        newState[template.templateId] = {
          condition: bestMatchDevice ? bestMatchDevice.condition : 'Novo',
          purchasePrice: bestMatchDevice ? bestMatchDevice.purchasePrice : 0,
          additionalCost: 0,
          wooCommerceId: bestMatchDevice ? bestMatchDevice.wooCommerceId : '',
          forWeb: bestMatchDevice ? bestMatchDevice.forWeb : false,
          imei: '',
          actualSalePrice: '',
          notes: [],
          soldBy: '',
        };
        return newState;
      });

      setActiveTab('inventory');
    } catch (e) {
      console.error("Error adding unique device from table: ", e);
      showToast(`Greška pri dodavanju uređaja: ${e.message}`, 'error');
    }
  };


  const openDeviceDetailsPage = (id) => {
    setSelectedDeviceId(id);
  };

  const closeDeviceDetailsPage = () => {
    setSelectedDeviceId(null);
  };

  const handleUpdateDevice = async (updatedDevice) => {
    if (!db || !userId || !appId) {
      showToast('Firebase nije spreman. Molimo pričekajte.', 'error');
      return;
    }
    try {
      const docRef = doc(db, `artifacts/${appId}/users/${userId}/devices`, updatedDevice.id);
      await updateDoc(docRef, updatedDevice);
      showToast('Uređaj uspješno ažuriran!', 'success');

      // Check if status changed to 'Prodan' or 'Rezerviran' to trigger WooCommerce sync
      const originalDevice = devices.find(d => d.id === updatedDevice.id);
      if (originalDevice && originalDevice.status === 'Na stanju' &&
          (updatedDevice.status === 'Prodan' || updatedDevice.status === 'Rezerviran')) {
          handleTriggerWooCommerceSync();
      }

    } catch (e) {
      console.error("Error updating device: ", e);
      showToast(`Greška pri ažuriranju uređaja: ${e.message}`, 'error');
    }
  };

  const handleDeleteDevice = async (id) => {
    if (!db || !userId || !appId) {
      showToast('Firebase nije spreman. Molimo pričekajte.', 'error');
      return;
    }
    try {
      const docRef = doc(db, `artifacts/${appId}/users/${userId}/devices`, id);
      await deleteDoc(docRef);
      showToast('Uređaj uspješno obrisan!', 'success');
    } catch (e) {
      console.error("Error deleting device: ", e);
      showToast(`Greška pri brisanju uređaja: ${e.message}`, 'error');
    }
  };

  const applyFilters = (devicesToFilter) => {
    let filtered = devicesToFilter;

    // Apply the wooCommerceIdMissing filter first if it's active, and bypass other filters
    if (filters.wooCommerceIdMissing) {
        console.log("Applying wooCommerceIdMissing filter."); // Debug log
        return filtered.filter(device =>
            device.status === 'Na stanju' &&
            device.condition === 'Novo' &&
            device.forWeb === true && // Added this condition as per user's request
            (!device.wooCommerceId || device.wooCommerceId === '')
        );
    }

    // Apply other filters if wooCommerceIdMissing is NOT active
    if (filters.imei) {
      filtered = filtered.filter(device => device.imei.toLowerCase().includes(filters.imei.toLowerCase()));
    }
    if (filters.forWeb === 'Da') {
      filtered = filtered.filter(device => device.forWeb);
    }
    if (filters.forWeb === 'Ne') {
      filtered = filtered.filter(device => !device.forWeb);
    }
    if (filters.brand) {
      filtered = filtered.filter(device => device.brand.toLowerCase().includes(filters.brand.toLowerCase()));
    }
    if (filters.model) {
      filtered = filtered.filter(device => device.model.toLowerCase().includes(filters.model.toLowerCase()));
    }
    if (filters.color) {
      filtered = filtered.filter(device => device.color && device.color.toLowerCase().includes(filters.color.toLowerCase()));
    }
    if (filters.storageGB) {
      filtered = filtered.filter(device => device.storageGB && device.storageGB.includes(filters.storageGB));
    }
    if (filters.status) {
      filtered = filtered.filter(device => device.status === filters.status);
    }
    if (filters.condition) {
      filtered = filtered.filter(device => device.condition === filters.condition);
    }
    if (filters.purchaseDateStart) {
      filtered = filtered.filter(device => new Date(device.purchaseDate) >= new Date(filters.purchaseDateStart));
    }
    if (filters.purchaseDateEnd) {
      filtered = filtered.filter(device => new Date(device.purchaseDate) <= new Date(filters.purchaseDateEnd));
    }

    return filtered;
  };

  const requestSort = (key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  const handleEmailLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    if (!auth) {
      setLoginError('Firebase Auth nije inicijaliziran.');
      return;
    }
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      console.error("Email login error:", error);
      setLoginError('Neispravan email ili lozinka. Ili nemate ovlaštenje za pristup.');
    }
  };

  const handleGoogleLogin = async () => {
    setLoginError('');
    if (!auth) {
      setLoginError('Firebase Auth nije inicijaliziran.');
      return;
    }
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Google login error:", error);
      if (error.code === 'auth/popup-closed-by-user') {
        setLoginError('Prijava prekinuta od strane korisnika.');
      } else {
        setLoginError('Greška pri Google prijavi. Ili nemate ovlaštenje za pristup.');
      }
    }
  };

  const handleLogout = async () => {
    if (auth) {
      try {
        await signOut(auth);
        showToast('Uspješno ste se odjavili.', 'success');
        setActiveTab('inventory');
      } catch (error) {
        console.error("Logout error:", error);
        showToast(`Greška pri odjavi: ${error.message}`, 'error');
      }
    }
  };

  // Import Devices Function
  const handleImportDevices = async (importedData) => {
    if (!db || !userId || !appId) {
      showToast('Firebase nije spreman. Molimo pričekajte.', 'error');
      return;
    }
    if (!Array.isArray(importedData)) {
      showToast('Učitana datoteka nije valjana lista uređaja (očekivan je niz).', 'error');
      return;
    }

    try {
      let importedCount = 0;
      for (const deviceData of importedData) {
        // Clean and extract model from "Marka/Model" or "Marka/Marka/Model"
        const cleanedModel = deviceData.Model ? deviceData.Model.split('/').pop().trim() : '';

        // Map "Status" from "Otvoren" to "Na stanju"
        const statusMapping = {
          "Otvoren": "Na stanju",
          "Zatvoren": "Prodan" // Assuming "Zatvoren" means sold in old app
        };
        const mappedStatus = statusMapping[deviceData.Status] || "Na stanju"; // Default to "Na stanju"

        const deviceToSave = {
          // Map existing fields from old JSON
          orderNumber: deviceData['Broj naloga'] || '',
          brand: deviceData.Marka || '',
          model: cleanedModel,
          purchaseDate: deviceData['Datum otkupa'] || '',
          imei: deviceData.IMEI || '',
          status: mappedStatus,

          // Set default values for new fields not present in old JSON
          color: '',
          storageGB: '',
          purchasePrice: 0, // Default to 0, user can update later
          actualSalePrice: 0, // Default to 0, user can update later
          additionalCost: 0, // Default to 0, user can update later
          marginEuro: '0.00€',
          marginPercent: '0.00%',
          condition: 'Rabljeno', // Default to Rabljeno, as old data might not specify
          warranty: false,
          warrantyEndDate: '',
          personWhoSold: 'Uvezeno', // Placeholder for imported devices
          oibWhoSold: '-',
          personAddress: '',
          personName: '',
          testedBy: '',
          wooCommerceId: '',
          forWeb: false,
          notes: [],
          timestamp: new Date().toISOString(), // Use current timestamp for import
          soldBy: '', // Initialize new field for imported devices
        };

        // Basic validation for brand and model
        if (deviceToSave.brand && deviceToSave.model) {
          await addDoc(collection(db, `artifacts/${appId}/users/${userId}/devices`), deviceToSave);
          importedCount++;
        } else {
          console.warn('Skipping invalid device record during import (missing brand or model):', deviceData);
        }
      }
      showToast(`Uspješno uvezeno ${importedCount} uređaja!`, 'success');
      setActiveTab('inventory'); // Go back to inventory view
    } catch (e) {
      console.error("Error importing devices:", e);
      showToast(`Greška pri uvozu uređaja: ${e.message}`, 'error');
    }
  };

  // Export Devices Function
  const handleExportDevices = async () => {
    if (!db || !userId || !appId) {
      showToast('Firebase nije spreman. Molimo pričekajte.', 'error');
      return;
    }
    try {
      const devicesCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/devices`);
      const querySnapshot = await getDocs(devicesCollectionRef);
      const dataToExport = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      const jsonString = JSON.stringify(dataToExport, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `devices_export_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Podaci o uređajima uspješno izvezeni!', 'success');
    } catch (e) {
      console.error("Error exporting devices:", e);
      showToast(`Greška pri izvozu uređaja: ${e.message}`, 'error');
    }
  };

  // WooCommerce Sync Function - AŽURIRANO ZA NETLIFY FUNCTIONS
  const handleTriggerWooCommerceSync = async () => {
    // Provjerite je li Firebase aplikacija inicijalizirana (za Firestore)
    if (!firebaseApp || !userId || !appId) {
      showToast('Firebase nije spreman. Molimo pričekajte.', 'error');
      return;
    }
    
    // WooCommerce API ključevi su sada potrebni samo u Netlify funkciji,
    // ali ih i dalje provjeravamo ovdje ako želite ranu povratnu informaciju korisniku
    if (!woocommerceApiKeys.consumerKey || !woocommerceApiKeys.consumerSecret) {
      showToast('Molimo unesite WooCommerce Consumer Key i Consumer Secret u postavkama.', 'warning');
      return;
    }

    showToast('Pokreće se WooCommerce sinkronizacija...', 'info');

    try {
      const productsToUpdate = {};

      devices.forEach(device => {
        if (device.forWeb && device.wooCommerceId) {
          const wooId = device.wooCommerceId.toString();
          if (device.status === 'Na stanju') {
            productsToUpdate[wooId] = (productsToUpdate[wooId] || 0) + 1;
          } else if (!productsToUpdate.hasOwnProperty(wooId)) { // Ako je za web, ali nije na stanju, i još nije brojan kao na stanju
            productsToUpdate[wooId] = 0; // Postavite zalihu na 0 za proizvode koji su 'forWeb' ali nisu 'Na stanju'
          }
        }
      });

      console.log("Podaci za slanje Netlify Functionu:", productsToUpdate);

      // --- STVARNI HTTP POZIV NA NETLIFY FUNCTION ---
      // Netlify Functions su dostupne na /.netlify/functions/your-function-name
      const functionUrl = '/.netlify/functions/updateProductStock'; // PUTANJA JE RELATIVNA NA VAŠ HOSTING

      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Ako želite autentikaciju, morali biste poslati ID token iz Firebasea
          // 'Authorization': `Bearer ${await auth.currentUser.getIdToken()}`
        },
        body: JSON.stringify({ productsToUpdate: productsToUpdate }),
      });

      const result = await response.json();
      // --- KRAJ STVARNOG HTTP POZIVA ---

      console.log("Rezultat sinkronizacije s Netlify Functiona:", result);

      if (response.ok) { // Provjerite je li HTTP status 2xx
        if (result && result.message) {
            showToast(result.message, 'success');
        } else {
            showToast('WooCommerce sinkronizacija dovršena.', 'success');
        }
      } else {
        const errorMessage = result.error || 'Nepoznata greška sa servera.';
        showToast(`Greška tijekom sinkronizacije: ${errorMessage}`, 'error');
        console.error("Greška detalji:", result.details);
      }

    } catch (e) {
      console.error("Greška tijekom WooCommerce sinkronizacije (poziv Netlify Functiona):", e);
      showToast(`Greška tijekom sinkronizacije: ${e.message}`, 'error');
    }
  };

  // Calculate the count of new devices "Na stanju" without WooCommerce ID
  const newDevicesWithoutWooIdCount = useMemo(() => {
    const count = devices.filter(device =>
      device.status === 'Na stanju' &&
      device.condition === 'Novo' &&
      device.forWeb === true && // Added this condition
      (!device.wooCommerceId || device.wooCommerceId === '')
    ).length;
    console.log("Broj novih uređaja bez WooCommerce ID-a (Na stanju, Novo, Za Web):", count); // Debug log for the count
    return count;
  }, [devices]);

  // Handle click on the new devices counter
  const handleNewDevicesWithoutWooIdClick = () => {
    setActiveTab('inventory'); // Ensure we are on the inventory tab
    setSelectedDeviceId(null); // Clear any selected device details
    // Set the specific filter flag, and clear all other potential filters
    setFilters({
      imei: '',
      forWeb: '',
      brand: '',
      model: '',
      color: '',
      storageGB: '',
      status: '', // Cleared, as it will be handled by wooCommerceIdMissing filter itself
      condition: '', // Cleared, as it will be handled by wooCommerceIdMissing filter itself
      purchaseDateStart: '',
      purchaseDateEnd: '',
      wooCommerceIdMissing: true, // This is the active filter
    });
    showToast('Prikazuju se novi uređaji bez WooCommerce ID-a.', 'info');
    console.log("Filters set for 'Novi za Web':", filters); // Debug log
  };


  const renderDeviceTable = () => {
    let filteredDevices = applyFilters(devices);
    console.log("Filtered devices count for table:", filteredDevices.length); // Debug log

    const sortedDevices = [...filteredDevices].sort((a, b) => {
      if (sortConfig.key) {
        const aValue = typeof a[sortConfig.key] === 'string' ? a[sortConfig.key].toLowerCase() : a[sortConfig.key];
        const bValue = typeof b[sortConfig.key] === 'string' ? b[sortConfig.key].toLowerCase() : b[sortConfig.key];

        if (aValue < bValue) {
          return sortConfig.direction === 'ascending' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'ascending' ? 1 : -1;
        }
      }
      return 0;
    });

    return (
      <div className="overflow-x-auto bg-white p-6 rounded-lg shadow-md">
        <h2 className="text-2xl font-semibold mb-4 text-gray-800">Pregled Zaliha</h2>

        <div className="mb-6 flex flex-wrap items-center gap-3">
          <input
            type="text"
            placeholder="IMEI/Serijski broj..."
            className="p-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500 flex-grow max-w-[180px] sm:max-w-none"
            value={filters.imei}
            onChange={(e) => setFilters({ ...filters, imei: e.target.value, wooCommerceIdMissing: false })} // Clear wooCommerceIdMissing filter
          />
          <select
            className="p-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500 flex-grow max-w-[120px] sm:max-w-none"
            value={filters.forWeb}
            onChange={(e) => setFilters({ ...filters, forWeb: e.target.value, wooCommerceIdMissing: false })} // Clear wooCommerceIdMissing filter
          >
            <option value="">Za Web (Svi)</option>
            <option value="Da">Da</option>
            <option value="Ne">Ne</option>
          </select>
          <input
            type="text"
            placeholder="Marka..."
            className="p-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500 flex-grow max-w-[120px] sm:max-w-none"
            value={filters.brand}
            onChange={(e) => setFilters({...filters, brand: e.target.value, wooCommerceIdMissing: false})}
          />
          <input
            type="text"
            placeholder="Model..."
            className="p-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500 flex-grow max-w-[150px] sm:max-w-none"
            value={filters.model}
            onChange={(e) => setFilters({...filters, model: e.target.value, wooCommerceIdMissing: false})}
          />
          <input
            type="text"
            placeholder="Boja..."
            className="p-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500 flex-grow max-w-[100px] sm:max-w-none"
            value={filters.color}
            onChange={(e) => setFilters({...filters, color: e.target.value, wooCommerceIdMissing: false})}
          />
          <input
            type="text"
            placeholder="Kapacitet (GB)..."
            className="p-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500 flex-grow max-w-[120px] sm:max-w-none"
            value={filters.storageGB}
            onChange={(e) => setFilters({...filters, storageGB: e.target.value, wooCommerceIdMissing: false})}
          />
          <select
            className="p-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500 flex-grow max-w-[120px] sm:max-w-none"
            value={filters.status}
            onChange={(e) => setFilters({...filters, status: e.target.value, wooCommerceIdMissing: false})}
          >
            <option value="">Status (Svi)</option>
            <option value="Na stanju">Na stanju</option>
            <option value="Prodan">Prodan</option>
            <option value="Rezerviran">Rezerviran</option>
          </select>
          <select
            className="p-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500 flex-grow max-w-[120px] sm:max-w-none"
            value={filters.condition}
            onChange={(e) => setFilters({...filters, condition: e.target.value, wooCommerceIdMissing: false})}
          >
            <option value="">Stanje (Svi)</option>
            <option value="Novo">Novo</option>
            <option value="Rabljeno">Rabljeno</option>
          </select>
          <div className="flex flex-col flex-grow min-w-[150px]">
            <label className="text-xs text-gray-500 mb-0.5">Datum Otkupa (od)</label>
            <input
              type="date"
              className="p-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
              value={filters.purchaseDateStart}
              onChange={(e) => setFilters({ ...filters, purchaseDateStart: e.target.value, wooCommerceIdMissing: false })}
            />
          </div>
          <div className="flex flex-col flex-grow min-w-[150px]">
            <label className="text-xs text-gray-500 mb-0.5">Datum Otkupa (do)</label>
            <input
              type="date"
              className="p-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
              value={filters.purchaseDateEnd}
              onChange={(e) => setFilters({ ...filters, purchaseDateEnd: e.target.value, wooCommerceIdMissing: false })}
            />
          </div>
          <button
            onClick={() => setFilters({ imei: '', forWeb: '', brand: '', model: '', color: '', storageGB: '', status: '', condition: '', purchaseDateStart: '', purchaseDateEnd: '', wooCommerceIdMissing: false })}
            className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md text-sm hover:bg-gray-300 transition duration-300 flex-shrink-0"
          >
            Poništi Filter
          </button>
        </div>


        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider rounded-tl-lg cursor-pointer" onClick={() => requestSort('orderNumber')}>Broj Naloga</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer" onClick={() => requestSort('brand')}>Marka</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer" onClick={() => requestSort('model')}>Model</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer" onClick={() => requestSort('color')}>Boja</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer" onClick={() => requestSort('storageGB')}>Kapacitet (GB)</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer" onClick={() => requestSort('purchaseDate')}>Datum Otkupa</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer" onClick={() => requestSort('condition')}>Stanje</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer" onClick={() => requestSort('imei')}>IMEI/Serijski Broj</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Otkupna Cijena</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Prodajna Cijena</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider rounded-tr-lg">Prodano od</th> {/* New column header */}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedDevices.length === 0 ? (
              <tr>
                <td colSpan="12" className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center">Nema pronađenih uređaja.</td>
              </tr>
            ) : (
              sortedDevices.map((device) => (
                <tr
                  key={device.id}
                  className="hover:bg-gray-50 cursor-pointer transition-colors duration-150"
                  onClick={() => openDeviceDetailsPage(device.id)}
                >
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{device.orderNumber || '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{device.brand}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{device.model}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{device.color || '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{device.storageGB || '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{device.purchaseDate}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{device.condition}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{device.imei}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{typeof device.purchasePrice === 'number' ? device.purchasePrice.toFixed(2) + '€' : '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{typeof device.actualSalePrice === 'number' && device.actualSalePrice > 0 ? device.actualSalePrice.toFixed(2) + '€' : '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      device.status === 'Na stanju' ? 'bg-green-100 text-green-800' :
                      device.status === 'Prodan' ? 'bg-red-100 text-red-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {device.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{device.soldBy || '-'}</td> {/* Display soldBy */}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    );
  };

  const renderAddPhysicalPurchaseDeviceForm = () => {
    const handleTemplateSelect = (selectedDevice) => {
      if (selectedDevice) {
        setNewPhysicalPurchaseDevice(prev => ({
          ...prev,
          brand: selectedDevice.brand,
          model: selectedDevice.model,
          color: selectedDevice.color,
          storageGB: selectedDevice.storageGB,
          condition: selectedDevice.condition,
          wooCommerceId: selectedDevice.wooCommerceId,
          forWeb: selectedDevice.forWeb,
        }));
        setPhysicalPurchaseTemplateSearchQuery(
          `${selectedDevice.brand} - ${selectedDevice.model} (${selectedDevice.color || '-'}, ${selectedDevice.storageGB || '-'}GB) - ${selectedDevice.condition} - WooCommerce ID: ${selectedDevice.wooCommerceId || '-'}`
        );
        setFilteredPhysicalPurchaseTemplateDevices([]);
      }
    };


    return (
      <div className="bg-white p-8 rounded-lg shadow-md w-full mx-auto">
        <h2 className="text-2xl font-semibold mb-6 text-gray-800 text-center">Unos Otkupa od Fizičke osobe</h2>

        <div className="mb-6 relative">
          <label htmlFor="physicalPurchaseTemplateSearch" className="block text-sm font-medium text-gray-700 mb-1">Pretraži predloške unesenih uređaja:</label>
          <input
            type="text"
            id="physicalPurchaseTemplateSearch"
            name="physicalPurchaseTemplateSearch" // Dodano ime za input
            value={physicalPurchaseTemplateSearchQuery}
            onChange={(e) => setPhysicalPurchaseTemplateSearchQuery(e.target.value)}
            className="p-3 border border-gray-300 rounded-md w-full focus:ring-blue-500 focus:border-blue-500"
            placeholder="Pretraži po marki, modelu, boji ili kapacitetu..."
          />
          {filteredPhysicalPurchaseTemplateDevices.length > 0 && physicalPurchaseTemplateSearchQuery.length > 2 && (
            <ul className="absolute z-10 w-full bg-white border border-gray-300 rounded-md mt-1 max-h-60 overflow-y-auto shadow-lg">
              {filteredPhysicalPurchaseTemplateDevices.map((device) => (
                <li
                  key={device.id}
                  onClick={() => handleTemplateSelect(device)}
                  className="p-3 hover:bg-gray-100 cursor-pointer border-b border-gray-200 last:border-b-0 text-sm"
                >
                  {device.brand} - {device.model} ({device.color || '-'}, {device.storageGB || '-'}GB) - {device.condition} - WooCommerce ID: {device.wooCommerceId || '-'}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="p-4 border border-gray-200 rounded-lg bg-gray-50 mb-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-3">Osnovne Informacije Uređaja</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label htmlFor="physicalPurchaseBrand" className="block text-sm font-medium text-gray-700 mb-1">Marka <span className="text-red-500">*</span></label>
              <input
                type="text"
                id="physicalPurchaseBrand"
                name="brand"
                value={newPhysicalPurchaseDevice.brand}
                onChange={handleNewPhysicalPurchaseDeviceChange}
                className="p-3 border border-gray-300 rounded-md w-full focus:ring-blue-500 focus:border-blue-500"
                placeholder="Npr. Samsung, Apple, Xiaomi"
                required
              />
            </div>
            <div>
              <label htmlFor="physicalPurchaseModel" className="block text-sm font-medium text-gray-700 mb-1">Model <span className="text-red-500">*</span></label>
              <input
                type="text"
                id="physicalPurchaseModel"
                name="model"
                value={newPhysicalPurchaseDevice.model}
                onChange={handleNewPhysicalPurchaseDeviceChange}
                className="p-3 border border-gray-300 rounded-md w-full focus:ring-blue-500 focus:border-blue-500"
                placeholder="Npr. S25 Ultra"
                required
              />
            </div>
            <div>
              <label htmlFor="physicalPurchaseColor" className="block text-sm font-medium text-gray-700 mb-1">Boja</label>
              <input
                type="text"
                id="physicalPurchaseColor"
                name="color"
                value={newPhysicalPurchaseDevice.color}
                onChange={handleNewPhysicalPurchaseDeviceChange}
                className="p-3 border border-gray-300 rounded-md w-full focus:ring-blue-500 focus:border-blue-500"
                placeholder="Npr. Titanium Black"
              />
            </div>
            <div>
              <label htmlFor="physicalPurchaseStorageGB" className="block text-sm font-medium text-gray-700 mb-1">Kapacitet (GB)</label>
              <input
                type="text"
                id="physicalPurchaseStorageGB"
                name="storageGB"
                value={newPhysicalPurchaseDevice.storageGB}
                onChange={handleNewPhysicalPurchaseDeviceChange}
                className="p-3 border border-gray-300 rounded-md w-full focus:ring-blue-500 focus:border-blue-500"
                placeholder="Npr. 256"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Stanje</label>
              <div className="flex items-center space-x-4 h-full">
                <label htmlFor="physicalPurchaseConditionNew" className="inline-flex items-center">
                  <input
                    type="radio"
                    id="physicalPurchaseConditionNew"
                    name="condition"
                    value="Novo"
                    checked={newPhysicalPurchaseDevice.condition === 'Novo'}
                    onChange={handleNewPhysicalPurchaseDeviceChange}
                    className="form-radio h-5 w-5 text-blue-600 rounded-full"
                  />
                  <span className="ml-2 text-gray-900">Novo</span>
                </label>
                <label htmlFor="physicalPurchaseConditionUsed" className="inline-flex items-center">
                  <input
                    type="radio"
                    id="physicalPurchaseConditionUsed"
                    name="condition"
                    value="Rabljeno"
                    checked={newPhysicalPurchaseDevice.condition === 'Rabljeno'}
                    onChange={handleNewPhysicalPurchaseDeviceChange}
                    className="form-radio h-5 w-5 text-blue-600 rounded-full"
                  />
                  <span className="ml-2 text-gray-900">Rabljeno</span>
                </label>
              </div>
            </div>
            <div>
              <label htmlFor="physicalPurchaseWooCommerceId" className="block text-sm font-medium text-gray-700 mb-1">WooCommerce Product ID</label>
              <input
                type="text"
                id="physicalPurchaseWooCommerceId"
                name="wooCommerceId"
                value={newPhysicalPurchaseDevice.wooCommerceId}
                onChange={handleNewPhysicalPurchaseDeviceChange}
                className="p-3 border border-gray-300 rounded-md w-full focus:ring-blue-500 focus:border-blue-500"
                placeholder="Opcionalno"
              />
            </div>
          </div>
        </div>

        <div className="p-4 border border-blue-200 rounded-lg bg-blue-50 mb-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-3">Detalji Otkupa Specifičnog Uređaja</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label htmlFor="physicalPurchaseDate" className="block text-sm font-medium text-gray-700 mb-1">Datum Otkupa</label>
              <input
                type="date"
                id="physicalPurchaseDate"
                name="purchaseDate"
                value={newPhysicalPurchaseDevice.purchaseDate}
                onChange={handleNewPhysicalPurchaseDeviceChange}
                className="p-3 border border-gray-300 rounded-md w-full focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label htmlFor="physicalPurchasePrice" className="block text-sm font-medium text-gray-700 mb-1">Otkupna Cijena (€)</label>
              <input
                type="number"
                id="physicalPurchasePrice"
                name="purchasePrice"
                value={newPhysicalPurchaseDevice.purchasePrice}
                onChange={handleNewPhysicalPurchaseDeviceChange}
                className="p-3 border border-gray-300 rounded-md w-full focus:ring-blue-500 focus:border-blue-500"
                placeholder="Npr. 900.00"
                step="0.01"
              />
            </div>
            <div className="md:col-span-2 lg:col-span-1">
              <label htmlFor="physicalPurchaseImei" className="block text-sm font-medium text-gray-700 mb-1">IMEI / Serijski Broj</label>
              <input
                type="text"
                id="physicalPurchaseImei"
                name="imei"
                value={newPhysicalPurchaseDevice.imei}
                onChange={handleNewPhysicalPurchaseDeviceChange}
                className="p-3 border border-gray-300 rounded-md w-full focus:ring-blue-500 focus:border-blue-500"
                placeholder="Unesite broj"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sljedeći Broj Naloga:</label>
              <p className="p-3 border border-gray-300 rounded-md w-full bg-gray-100 text-sm font-semibold">OTK-{String(nextOrderNumber).padStart(6, '0')}</p>
            </div>
          </div>
        </div>

        <div className="p-4 border border-blue-200 rounded-lg bg-blue-100 mb-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-3">Podaci Osobe od Koje je Otkupljeno</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="physicalPurchasePersonWhoSold" className="block text-sm font-medium text-gray-700 mb-1">Ime i prezime osobe</label>
              <input
                type="text"
                id="physicalPurchasePersonWhoSold"
                name="personWhoSold"
                value={newPhysicalPurchaseDevice.personWhoSold}
                onChange={handleNewPhysicalPurchaseDeviceChange}
                className="p-3 border border-gray-300 rounded-md w-full focus:ring-blue-500 focus:border-blue-500"
                placeholder="Npr. Ivan Horvat"
              />
            </div>
            <div>
              <label htmlFor="physicalPurchaseOibWhoSold" className="block text-sm font-medium text-gray-700 mb-1">OIB Osobe</label>
              <input
                type="text"
                id="physicalPurchaseOibWhoSold"
                name="oibWhoSold"
                value={newPhysicalPurchaseDevice.oibWhoSold}
                onChange={handleNewPhysicalPurchaseDeviceChange}
                maxLength="11"
                className="p-3 border border-gray-300 rounded-md w-full focus:ring-blue-500 focus:border-blue-500"
                placeholder="Npr. 12345678901"
              />
            </div>
            <div className="col-span-full">
              <label htmlFor="physicalPurchasePersonAddress" className="block text-sm font-medium text-gray-700 mb-1">Adresa Osobe</label>
              <input
                type="text"
                id="physicalPurchasePersonAddress"
                name="personAddress"
                value={newPhysicalPurchaseDevice.personAddress}
                onChange={handleNewPhysicalPurchaseDeviceChange}
                className="p-3 border border-gray-300 rounded-md w-full focus:ring-blue-500 focus:border-blue-500"
                placeholder="Npr. Ulica lipa 5, 10000 Zagreb"
              />
            </div>
            <div>
              <label htmlFor="physicalPurchasePersonName" className="block text-sm font-medium text-gray-700 mb-1">Otkupio/la (Djelatnik)</label>
              <select
                id="physicalPurchasePersonName"
                name="personName"
                value={newPhysicalPurchaseDevice.personName}
                onChange={handleNewPhysicalPurchaseDeviceChange}
                className="p-3 border border-gray-300 rounded-md w-full focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Odaberite djelatnika</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.name}>{emp.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="physicalPurchaseTestedBy" className="block text-sm font-medium text-gray-700 mb-1">Tko je testirao</label>
              <select
                id="physicalPurchaseTestedBy"
                name="testedBy"
                value={newPhysicalPurchaseDevice.testedBy}
                onChange={handleNewPhysicalPurchaseDeviceChange}
                className="p-3 border border-gray-300 rounded-md w-full focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Odaberite djelatnika</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.name}>{emp.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>


        <div className="flex justify-center mt-8">
          <button
            onClick={handleAddPhysicalPurchaseDevice}
            className="px-6 py-3 bg-blue-600 text-white font-bold rounded-lg shadow-lg hover:bg-blue-700 transition duration-300 ease-in-out transform hover:scale-105"
          >
            Dodaj Uređaj
          </button>
        </div>
      </div>
    );
  };

  const renderAddWebPurchaseDeviceForm = () => {
    const handleTemplateSelectMainForm = (selectedDevice) => {
      if (selectedDevice) {
        setNewWebPurchaseDevice(prev => ({
          ...prev,
          brand: selectedDevice.brand,
          model: selectedDevice.model,
          color: selectedDevice.color,
          storageGB: selectedDevice.storageGB,
          condition: selectedDevice.condition,
          purchasePrice: selectedDevice.purchasePrice,
          wooCommerceId: selectedDevice.wooCommerceId,
          forWeb: true,
          imei: '',
        }));
        setWebPurchaseTemplateSearchQuery(`${selectedDevice.brand} - ${selectedDevice.model} - (${selectedDevice.color || '-'}, ${selectedDevice.storageGB || '-'}GB)`);
        setFilteredWebPurchaseTemplateDevices([]);
      }
    };

    const allBrands = [...new Set(devices.map(device => device.brand))];

    return (
      <div className="bg-white p-8 rounded-lg shadow-md w-full mx-auto">
        <h2 className="text-2xl font-semibold mb-6 text-gray-800 text-center">Unos Web Otkupa</h2>

        <div className="mt-4 p-6 border border-gray-200 rounded-lg">
          <h3 className="text-xl font-semibold mb-4 text-blue-700">Dodaj Uređaje iz Postojećih Predložaka</h3>
          
          <div className="mb-4 flex flex-wrap gap-2">
            <button
              onClick={() => setUniqueDeviceTableSearchQuery('')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors duration-300 ${
                uniqueDeviceTableSearchQuery === '' ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
              }`}
            >
              Svi Uređaji
            </button>
            {allBrands.map(brand => (
              <button
                key={brand}
                onClick={() => setUniqueDeviceTableSearchQuery(brand)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors duration-300 ${
                  uniqueDeviceTableSearchQuery === brand ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
                }`}
              >
                {brand}
              </button>
            ))}
          </div>

          <div className="mb-4">
            <input
              type="text"
              placeholder="Pretraži po marki, modelu, boji ili kapacitetu u tablici..."
              className="p-2 border border-gray-300 rounded-md w-full focus:ring-blue-500 focus:border-blue-500 text-sm"
              value={uniqueDeviceTableSearchQuery}
              onChange={(e) => setUniqueDeviceTableSearchQuery(e.target.value)}
            />
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider rounded-tl-lg">Marka</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Model</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Boja</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Kapacitet (GB)</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stanje</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Otkupna Cijena</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Prodajna Cijena</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">IMEI/Serijski Broj</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Za Web</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">WooCommerce ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider rounded-tr-lg">Akcija</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredUniqueDeviceTemplates.length === 0 ? (
                  <tr>
                    <td colSpan="11" className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center">Nema pronađenih predložaka.</td>
                  </tr>
                ) : (
                  filteredUniqueDeviceTemplates.map((template) => {
                    const initialRowData = uniqueDeviceRowData[template.templateId] || {};
                    return (
                      <tr key={template.templateId}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{template.brand}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{template.model}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{template.color || '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{template.storageGB || '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <div className="flex items-center space-x-2">
                            <label className="inline-flex items-center">
                              <input
                                type="radio"
                                name={`condition-${template.templateId}`}
                                value="Novo"
                                checked={initialRowData.condition === 'Novo'}
                                onChange={(e) => handleUniqueDeviceInputChange(template.templateId, 'condition', e.target.value)}
                                className="form-radio h-5 w-5 text-blue-600 rounded-full"
                              />
                              <span className="ml-1 text-gray-900 text-xs">Novo</span>
                            </label>
                            <label className="inline-flex items-center">
                              <input
                                type="radio"
                                name={`condition-${template.templateId}`}
                                value="Rabljeno"
                                checked={initialRowData.condition === 'Rabljeno'}
                                onChange={(e) => handleUniqueDeviceInputChange(template.templateId, 'condition', e.target.value)}
                                className="form-radio h-5 w-5 text-blue-600 rounded-full"
                              />
                              <span className="ml-1 text-gray-900 text-xs">Rabljeno</span>
                            </label>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <input
                            type="number"
                            className="p-2 border border-gray-300 rounded-md text-sm w-full focus:ring-blue-500 focus:border-blue-500"
                            placeholder="Unesi cijenu"
                            value={initialRowData.purchasePrice || ''}
                            onChange={(e) => handleUniqueDeviceInputChange(template.templateId, 'purchasePrice', e.target.value)}
                            step="0.01"
                          />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <input
                            type="number"
                            className="p-2 border border-gray-300 rounded-md text-sm w-full focus:ring-blue-500 focus:border-blue-500"
                            placeholder="Unesi cijenu"
                            value={initialRowData.actualSalePrice || ''}
                            onChange={(e) => handleUniqueDeviceInputChange(template.templateId, 'actualSalePrice', e.target.value)}
                            step="0.01"
                          />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <div className="flex items-center space-x-2">
                            <input
                              type="text"
                              className="p-2 border border-gray-300 rounded-md text-sm w-40 focus:ring-blue-500 focus:border-blue-500"
                              placeholder="Unesi IMEI"
                              value={initialRowData.imei || ''}
                              onChange={(e) => handleUniqueDeviceInputChange(template.templateId, 'imei', e.target.value)}
                            />
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
                          <input
                            type="checkbox"
                            name={`forWeb-${template.templateId}`}
                            checked={initialRowData.forWeb}
                            onChange={(e) => handleUniqueDeviceInputChange(template.templateId, 'forWeb', e.target.checked)}
                            className="form-checkbox h-5 w-5 text-blue-600 rounded"
                          />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <input
                            type="text"
                            className="p-2 border border-gray-300 rounded-md text-sm w-full focus:ring-blue-500 focus:border-blue-500"
                            placeholder="WooCommerce ID"
                            value={initialRowData.wooCommerceId || ''}
                            onChange={(e) => handleUniqueDeviceInputChange(template.templateId, 'wooCommerceId', e.target.value)}
                          />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <button
                            onClick={() => handleAddUniqueDeviceFromTable(template)}
                            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition duration-300"
                          >
                            Dodaj Uređaj
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="p-6 border border-gray-200 rounded-lg mt-8">
          <h3 className="text-xl font-semibold mb-4 text-blue-700">Ručni Unos Web Otkupa</h3>
          <div className="mb-6 relative">
            <label htmlFor="webPurchaseTemplateSearch" className="block text-sm font-medium text-gray-700 mb-1">Pretraži predloške unesenih uređaja:</label>
            <input
              type="text"
              id="webPurchaseTemplateSearch"
              name="webPurchaseTemplateSearch" // Dodano ime za input
              value={webPurchaseTemplateSearchQuery}
              onChange={(e) => setWebPurchaseTemplateSearchQuery(e.target.value)}
              className="p-3 border border-gray-300 rounded-md w-full focus:ring-blue-500 focus:border-blue-500"
              placeholder="Pretraži po marki, modelu, boji ili kapacitetu..."
            />
            {filteredWebPurchaseTemplateDevices.length > 0 && webPurchaseTemplateSearchQuery.length > 2 && (
              <ul className="absolute z-10 w-full bg-white border border-gray-300 rounded-md mt-1 max-h-60 overflow-y-auto shadow-lg">
                {filteredWebPurchaseTemplateDevices.map((device) => (
                  <li
                    key={device.id}
                    onClick={() => handleTemplateSelectMainForm(device)}
                    className="p-3 hover:bg-gray-100 cursor-pointer border-b border-gray-200 last:border-b-0"
                  >
                    {device.brand} - {device.model} ({device.color || '-'}, {device.storageGB || '-'}GB)
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-6">
            <div>
              <label htmlFor="webPurchaseBrand" className="block text-sm font-medium text-gray-700 mb-1">Marka <span className="text-red-500">*</span></label>
              <input
                type="text"
                id="webPurchaseBrand"
                name="brand"
                value={newWebPurchaseDevice.brand}
                onChange={handleNewWebPurchaseDeviceChange}
                className="p-3 border border-gray-300 rounded-md w-full focus:ring-blue-500 focus:border-blue-500"
                placeholder="Npr. Samsung"
                required
              />
            </div>
            <div>
              <label htmlFor="webPurchaseModel" className="block text-sm font-medium text-gray-700 mb-1">Model <span className="text-red-500">*</span></label>
              <input
                type="text"
                id="webPurchaseModel"
                name="model"
                value={newWebPurchaseDevice.model}
                onChange={handleNewWebPurchaseDeviceChange}
                className="p-3 border border-gray-300 rounded-md w-full focus:ring-blue-500 focus:border-blue-500"
                placeholder="Npr. S25 Ultra"
                required
              />
            </div>
            <div>
              <label htmlFor="webPurchaseColor" className="block text-sm font-medium text-gray-700 mb-1">Boja</label>
              <input
                type="text"
                id="webPurchaseColor"
                name="color"
                value={newWebPurchaseDevice.color}
                onChange={handleNewWebPurchaseDeviceChange}
                className="p-3 border border-gray-300 rounded-md w-full focus:ring-blue-500 focus:border-blue-500"
                placeholder="Npr. Plava"
              />
            </div>
            <div>
              <label htmlFor="webPurchaseStorageGB" className="block text-sm font-medium text-gray-700 mb-1">Kapacitet (GB)</label>
              <input
                type="text"
                id="webPurchaseStorageGB"
                name="storageGB"
                value={newWebPurchaseDevice.storageGB}
                onChange={handleNewWebPurchaseDeviceChange}
                className="p-3 border border-gray-300 rounded-md w-full focus:ring-blue-500 focus:border-blue-500"
                placeholder="Npr. 256"
              />
            </div>
            <div className="flex items-center space-x-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Stanje:</label>
              <label htmlFor="webPurchaseConditionNew" className="inline-flex items-center">
                <input
                  type="radio"
                  id="webPurchaseConditionNew"
                  name="condition"
                  value="Novo"
                  checked={newWebPurchaseDevice.condition === 'Novo'}
                  onChange={handleNewWebPurchaseDeviceChange}
                  className="form-radio h-5 w-5 text-blue-600 rounded-full"
                />
                <span className="ml-2 text-gray-900">Novo</span>
              </label>
              <label htmlFor="webPurchaseConditionUsed" className="inline-flex items-center">
                <input
                  type="radio"
                  id="webPurchaseConditionUsed"
                  name="condition"
                  value="Rabljeno"
                  checked={newWebPurchaseDevice.condition === 'Rabljeno'}
                  onChange={handleNewWebPurchaseDeviceChange}
                  className="form-radio h-5 w-5 text-blue-600 rounded-full"
                />
                <span className="ml-2 text-gray-900">Rabljeno</span>
              </label>
            </div>
            <div>
              <label htmlFor="webPurchasePrice" className="block text-sm font-medium text-gray-700 mb-1">Otkupna Cijena (€)</label>
              <input
                type="number"
                id="webPurchasePrice"
                name="purchasePrice"
                value={newWebPurchaseDevice.purchasePrice}
                onChange={handleNewWebPurchaseDeviceChange}
                className="p-3 border border-gray-300 rounded-md w-full focus:ring-blue-500 focus:border-blue-500"
                placeholder="Cijena s web stranice"
                step="0.01"
              />
            </div>
            <div>
              <label htmlFor="webPurchaseWooCommerceId" className="block text-sm font-medium text-gray-700 mb-1">WooCommerce Product ID</label>
              <input
                type="text"
                id="webPurchaseWooCommerceId"
                name="wooCommerceId"
                value={newWebPurchaseDevice.wooCommerceId}
                onChange={handleNewWebPurchaseDeviceChange}
                className="p-3 border border-gray-300 rounded-md w-full focus:ring-blue-500 focus:border-blue-500"
                placeholder="Opcionalno"
              />
            </div>
            <div className="col-span-full md:col-span-2 lg:col-span-1 flex items-end">
              <div className="flex-grow mr-2">
                <label htmlFor="webPurchaseImei" className="block text-sm font-medium text-gray-700 mb-1">IMEI / Serijski Broj <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  id="webPurchaseImei"
                  name="imei"
                  value={newWebPurchaseDevice.imei}
                  onChange={handleNewWebPurchaseDeviceChange}
                  className="p-3 border border-gray-300 rounded-md w-full focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Skenirajte ili unesite broj"
                  required
                />
              </div>
            </div>
            <div className="flex items-center pt-2">
              <label htmlFor="webPurchaseForWeb" className="inline-flex items-center">
                <input
                  type="checkbox"
                  id="webPurchaseForWeb"
                  name="forWeb"
                  checked={newWebPurchaseDevice.forWeb}
                  onChange={handleNewWebPurchaseDeviceChange}
                  className="form-checkbox h-5 w-5 text-blue-600 rounded"
                />
                <span className="ml-2 text-sm font-medium text-gray-700">Za Web Trgovinu</span>
              </label>
            </div>
          </div>
          <div className="flex justify-center mt-8">
            <button
              onClick={handleAddWebPurchaseDevice}
              className="px-6 py-3 bg-blue-600 text-white font-bold rounded-lg shadow-lg hover:bg-blue-700 transition duration-300 ease-in-out transform hover:scale-105"
            >
              Dodaj Uređaj
            </button>
          </div>
        </div>
      </div>
    );
  };


  const renderEmployeesManagement = () => {
    const handleAddEmployee = async () => {
      if (!db || !userId || !appId) {
        showToast('Firebase nije spreman. Molimo pričekajte.', 'error');
        return;
      }
      if (newEmployeeName.trim()) {
        try {
          await addDoc(collection(db, `artifacts/${appId}/users/${userId}/employees`), { name: newEmployeeName.trim() });
          showToast('Djelatnik uspješno dodan!', 'success');
          setNewEmployeeName('');
        } catch (e) {
          console.error("Error adding employee: ", e);
          showToast(`Greška pri dodavanju djelatnika: ${e.message}`, 'error');
        }
      } else {
        showToast('Ime djelatnika ne može biti prazno.', 'error');
      }
    };

    const handleDeleteEmployee = async (id) => {
      if (!db || !userId || !appId) {
        showToast('Firebase nije spreman. Molimo pričekajte.', 'error');
        return;
      }
      const employeeToDelete = employees.find(emp => emp.id === id);
      if (!employeeToDelete) {
          showToast('Djelatnik nije pronađen.', 'error');
          return;
      }

      const isEmployeeUsed = devices.some(device =>
        employeeToDelete.name === device.personName ||
        employeeToDelete.name === device.testedBy ||
        employeeToDelete.name === device.soldBy // Check if used in soldBy field
      );
      if (isEmployeeUsed) {
        showToast('Djelatnik je povezan s postojećim uređajima i ne može se obrisati.', 'error');
        return;
      }

      try {
        const docRef = doc(db, `artifacts/${appId}/users/${userId}/employees`, id);
        await deleteDoc(docRef);
        showToast('Djelatnik uspješno obrisan!', 'success');
      } catch (e) {
        console.error("Error deleting employee: ", e);
        showToast(`Greška pri brisanju djelatnika: ${e.message}`, 'error');
      }
    };

    return (
      <div className="bg-white p-8 rounded-lg shadow-md w-full mx-auto">
        <h2 className="text-2xl font-semibold mb-6 text-gray-800 text-center">Upravljanje Djelatnicima</h2>
        <div className="mb-6">
          <label htmlFor="newEmployeeName" className="block text-sm font-medium text-gray-700 mb-1">Dodaj Novog Djelatnika</label>
          <div className="flex space-x-3">
            <input
              type="text"
              id="newEmployeeName"
              value={newEmployeeName}
              onChange={(e) => setNewEmployeeName(e.target.value)}
              className="p-3 border border-gray-300 rounded-md flex-grow focus:ring-blue-500 focus:border-blue-500"
              placeholder="Ime i prezime djelatnika"
            />
            <button
              onClick={handleAddEmployee}
              className="px-4 py-2 bg-blue-600 text-white font-bold rounded-md hover:bg-blue-700 transition duration-300"
            >
              Dodaj
            </button>
          </div>
        </div>

        <div>
          <h3 className="text-xl font-medium text-gray-800 mb-4">Popis Djelatnika</h3>
          {employees.length === 0 ? (
            <p className="text-gray-500">Nema unesenih djelatnika.</p>
          ) : (
            <ul className="divide-y divide-gray-200 border border-gray-200 rounded-md">
              {employees.map(emp => (
                <li key={emp.id} className="flex justify-between items-center p-3 hover:bg-gray-50">
                  <span className="text-gray-900">{emp.name}</span>
                  <button
                    onClick={() => handleDeleteEmployee(emp.id)}
                    className="px-3 py-1 bg-red-500 text-white text-sm rounded-md hover:bg-red-600 transition duration-300"
                  >
                    Obriši
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  };

  const renderLogin = () => {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 px-4">
        <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-md">
          <h2 className="text-3xl font-bold text-gray-800 mb-6 text-center">Prijava</h2>
          {loginError && <p className="text-red-600 text-center mb-4">{loginError}</p>}
          <form onSubmit={handleEmailLogin} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email:</label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full p-3 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                placeholder="alphaservis@alphaservis.com"
                required
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">Lozinka:</label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full p-3 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                placeholder="Vaša lozinka"
                required
              />
            </div>
            <button
              type="submit"
              className="w-full px-4 py-3 bg-blue-600 text-white font-bold rounded-lg shadow-lg hover:bg-blue-700 transition duration-300"
            >
              Prijavi se s emailom i lozinkom
            </button>
          </form>
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">ILI</span>
            </div>
          </div>
          <button
            onClick={handleGoogleLogin}
            className="w-full flex items-center justify-center px-4 py-3 border border-gray-300 rounded-lg shadow-lg bg-white text-gray-700 font-bold hover:bg-gray-50 transition duration-300"
          >
            <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12.0003 4.75C14.0003 4.75 15.6603 5.451 16.9003 6.643L19.2703 4.295C17.4443 2.656 15.0253 1.75 12.0003 1.75C7.90132 1.75 4.39832 4.137 2.68432 7.643L7.15932 9.489C8.20432 7.022 9.93632 4.75 12.0003 4.75Z" fill="#EA4335"/>
              <path d="M22.2854 10.518H12.0004V13.918H17.8174C17.4584 15.228 16.6344 16.331 15.4854 17.07L19.0064 19.8C21.1094 17.72 22.2854 14.85 22.2854 10.518Z" fill="#4285F4"/>
              <path d="M15.4854 17.07C14.1814 17.91 12.5694 18.39 12.0004 18.39C9.93644 18.39 8.20444 16.711 7.15944 14.244L2.68444 16.091C4.39844 19.597 7.90144 21.984 12.0004 21.984C14.9394 21.984 17.4094 20.973 19.0064 19.8L15.4854 17.07Z" fill="#FBBC04"/>
              <path d="M2.68432 7.643L7.15932 9.489C7.81832 8.163 8.79032 7.218 9.93632 6.643C10.6693 6.273 11.3723 6.098 12.0003 6.098C12.9803 6.098 13.9513 6.425 14.7703 6.945L19.2693 4.295C17.4443 2.656 15.0253 1.75 12.0003 1.75C7.90132 1.75 4.39832 4.137 2.68432 7.643Z" fill="#34A853"/>
            </svg>
            Prijavi se s Googleom
          </button>
        </div>
      </div>
    );
  };

  const currentSelectedDevice = devices.find(d => d.id === selectedDeviceId);

  useLayoutEffect(() => {
    const styleElement = document.createElement('style');
    styleElement.textContent = `
      html, body, #root {
        height: 100%;
        margin: 0;
        font-family: 'Inter', sans-serif;
      }
      input[type="text"],
      input[type="number"],
      input[type="date"],
      select,
      input[type="password"] { /* Added password input to styling */
        border-radius: 0.5rem;
        box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
      }
      button {
        border-radius: 0.75rem;
      }
      input:focus, select:focus, textarea:focus {
        outline: none;
        box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.5);
        border-color: #3B82F6;
      }
      table {
        width: 100%;
        border-collapse: separate;
        border-spacing: 0;
      }
      thead th {
        background-color: #F9FAFB;
        border-bottom: 1px solid #E5E7EB;
      }
      tbody td {
        border-bottom: 1px solid #E5E7EB;
      }
      tbody tr:last-child td {
        border-bottom: none;
      }
      @keyframes fade-in-down {
        from {
          opacity: 0;
          transform: translateY(-20px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      .animate-fade-in-down {
        animation: fade-in-down 0.5s ease-out forwards;
      }
    `;
    document.head.appendChild(styleElement);

    const tailwindScript = document.createElement('script');
    tailwindScript.src = "https://cdn.tailwindcss.com";
    document.head.appendChild(tailwindScript);

    const jspdfScript = document.createElement('script');
    jspdfScript.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
    jspdfScript.onload = () => {
        if (window.jspdf && typeof window.jspdf.jsPDF === 'function') {
            window.jsPDF = window.jspdf.jsPDF;
        } else if (typeof window.jsPDF === 'function') {
            // Already available directly
        } else {
            console.error("jsPDF not found on window object after loading script.");
        }
    };
    document.head.appendChild(jspdfScript);

    const html2canvasScript = document.createElement('script');
    html2canvasScript.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
    html2canvasScript.onload = () => {
        if (typeof window.html2canvas === 'function') {
        } else {
            console.error("html2canvas not found on window object after loading script.");
        }
    };
    document.head.appendChild(html2canvasScript);


    const interFontLink = document.createElement('link');
    interFontLink.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap";
    interFontLink.rel = "stylesheet";
    document.head.appendChild(interFontLink);

    return () => {
      document.head.removeChild(styleElement);
      document.head.removeChild(tailwindScript);
      document.head.removeChild(jspdfScript);
      document.head.removeChild(html2canvasScript);
      document.head.removeChild(interFontLink);
    };
  }, []);


  if (loadingFirebase) {
    return (
      <div className="flex justify-center items-center h-screen bg-gray-100">
        <p className="text-xl font-semibold text-blue-700">Učitavanje Firebasea...</p>
      </div>
    );
  }

  if (firebaseError) {
    return (
      <div className="flex justify-center items-center h-screen bg-red-100 text-red-800 p-4 rounded-lg">
        <p className="text-xl font-semibold">{firebaseError}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 font-sans text-gray-900">
      <header className="bg-blue-700 text-white shadow-md p-4">
        <div className="container mx-auto flex justify-between items-center px-4 md:px-0 flex-wrap">
          <h1 className="text-2xl sm:text-3xl font-bold rounded-md mb-2 sm:mb-0">Mobilni Uređaji Manager</h1>
          {userId && appId && (
            <div className="text-xs text-blue-200 mt-1 md:mt-0 ml-4">
              <p>User ID: {userId.substring(0, 8)}...</p>
              <p>App ID: {appId}</p>
            </div>
          )}
          {isAuthorizedUser && (
            <nav className="w-full sm:w-auto flex items-center justify-end sm:justify-start space-x-2 sm:space-x-4">
              <ul className="flex flex-wrap justify-center sm:justify-start space-x-2 sm:space-x-4">
                <li>
                  <button
                    onClick={() => { setActiveTab('inventory'); setSelectedDeviceId(null); setFilters(prev => ({ ...prev, wooCommerceIdMissing: false })); }} // Clear wooCommerceIdMissing when navigating back to general inventory
                    className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-md text-sm sm:text-base font-medium transition-colors duration-300 ${
                      activeTab === 'inventory' && !selectedDeviceId && !filters.wooCommerceIdMissing ? 'bg-blue-800 text-white shadow-lg' : 'hover:bg-blue-600'
                    }`}
                  >
                    Pregled Zaliha
                  </button>
                </li>
                {newDevicesWithoutWooIdCount > 0 && (
                  <li>
                    <button
                      onClick={handleNewDevicesWithoutWooIdClick}
                      className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-md text-sm sm:text-base font-medium transition-colors duration-300 relative ${
                        filters.wooCommerceIdMissing ? 'bg-orange-600 text-white shadow-lg' : 'bg-orange-400 hover:bg-orange-500 text-white'
                      }`}
                      title="Novi uređaji bez WooCommerce ID-a"
                    >
                      Novi za Web
                      <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center z-10"> {/* Adjusted positioning and added z-index */}
                        {newDevicesWithoutWooIdCount}
                      </span>
                    </button>
                  </li>
                )}
                <li>
                  <button
                    onClick={() => { setActiveTab('add-physical-purchase'); setSelectedDeviceId(null); setFilters(prev => ({ ...prev, wooCommerceIdMissing: false })); }}
                    className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-md text-sm sm:text-base font-medium transition-colors duration-300 ${
                      activeTab === 'add-physical-purchase' && !selectedDeviceId ? 'bg-blue-800 text-white shadow-lg' : 'hover:bg-blue-600'
                    }`}
                  >
                    Unos Otkupa od Fizičke Osobe
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => { setActiveTab('add-web-purchase'); setSelectedDeviceId(null); setFilters(prev => ({ ...prev, wooCommerceIdMissing: false })); }}
                    className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-md text-sm sm:text-base font-medium transition-colors duration-300 ${
                      activeTab === 'add-web-purchase' && !selectedDeviceId ? 'bg-blue-800 text-white shadow-lg' : 'hover:bg-blue-600'
                    }`}
                  >
                    Unos Web Otkupa
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => { setActiveTab('employees'); setSelectedDeviceId(null); setFilters(prev => ({ ...prev, wooCommerceIdMissing: false })); }}
                    className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-md text-sm sm:text-base font-medium transition-colors duration-300 ${
                      activeTab === 'employees' && !selectedDeviceId ? 'bg-blue-800 text-white shadow-lg' : 'hover:bg-blue-600'
                    }`}
                  >
                    Djelatnici
                  </button>
                </li>
                 <li>
                  <button
                    onClick={() => { setActiveTab('statistics'); setSelectedDeviceId(null); setFilters(prev => ({ ...prev, wooCommerceIdMissing: false })); }}
                    className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-md text-sm sm:text-base font-medium transition-colors duration-300 ${
                      activeTab === 'statistics' ? 'bg-blue-800 text-white shadow-lg' : 'hover:bg-blue-600'
                    }`}
                    title="Statistika Prodaje i Zaliha"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 inline-block mr-1" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M2 11a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H3a1 1 0 01-1-1v-2z" />
                      <path fillRule="evenodd" d="M12.316 3.17c-.325-1.127-1.464-2-2.83-2S6.835 2.043 6.51 3.17A1.5 1.5 0 014.785 4.54H3a2 2 0 00-2 2v10a2 2 0 002 2h14a2 2 0 002-2V6.54a2 2 0 00-2-2h-1.785a1.5 1.5 0 01-1.724-1.37zM10 7a3 3 0 100 6 3 3 0 000-6z" clipRule="evenodd" />
                    </svg>
                    Statistika
                  </button>
                </li>
                {/* Settings Button */}
                <li>
                  <button
                    onClick={() => { setActiveTab('settings'); setSelectedDeviceId(null); setFilters(prev => ({ ...prev, wooCommerceIdMissing: false })); }}
                    className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-md text-sm sm:text-base font-medium transition-colors duration-300 ${
                      activeTab === 'settings' ? 'bg-blue-800 text-white shadow-lg' : 'hover:bg-blue-600'
                    }`}
                    title="Postavke"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 inline-block mr-1" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M11.49 3.17c-.325-1.127-1.464-2-2.83-2S6.835 2.043 6.51 3.17A1.5 1.5 0 014.785 4.54H3a2 2 0 00-2 2v10a2 2 0 002 2h14a2 2 0 002-2V6.54a2 2 0 00-2-2h-1.785a1.5 1.5 0 01-1.724-1.37zM10 7a3 3 0 100 6 3 3 0 000-6z" clipRule="evenodd" />
                    </svg>
                    Postavke
                  </button>
                </li>
                <li>
                  <button
                    onClick={handleLogout}
                    className="px-3 py-1.5 sm:px-4 sm:py-2 rounded-md text-sm sm:text-base font-medium transition-colors duration-300 bg-red-500 hover:bg-red-600 text-white"
                  >
                    Odjavi se
                  </button>
                </li>
              </ul>
            </nav>
          )}
        </div>
      </header>

      <main className="w-full px-[2%] py-6">
        {isAuthorizedUser ? (
          selectedDeviceId ? (
            <DeviceDetailsPage
              device={currentSelectedDevice}
              onUpdateDevice={handleUpdateDevice}
              onGoBack={closeDeviceDetailsPage}
              employees={employees}
              onDeleteDevice={handleDeleteDevice}
              purchaseBlockText={purchaseBlockText}
              companyInfo={companyInfo} // Pass companyInfo prop
              onStatusChangeTriggerWooCommerceSync={handleTriggerWooCommerceSync} // Pass sync function
            />
          ) : (
            <>
              {activeTab === 'inventory' && renderDeviceTable()}
              {activeTab === 'add-physical-purchase' && renderAddPhysicalPurchaseDeviceForm()}
              {activeTab === 'add-web-purchase' && renderAddWebPurchaseDeviceForm()}
              {activeTab === 'employees' && renderEmployeesManagement()}
              {activeTab === 'statistics' && <StatisticsPage devices={devices} employees={employees} />} {/* Render StatisticsPage */}
              {activeTab === 'settings' && (
                <SettingsPage
                  db={db}
                  userId={userId}
                  appId={appId}
                  purchaseBlockText={purchaseBlockText}
                  updatePurchaseBlockText={setPurchaseBlockText}
                  companyInfo={companyInfo} // Pass companyInfo
                  updateCompanyInfo={setCompanyInfo} // Pass update function
                  woocommerceApiKeys={woocommerceApiKeys} // Pass WooCommerce API keys
                  updateWooCommerceApiKeys={setWooCommerceApiKeys} // Pass update function for WooCommerce API keys
                  onTriggerWooCommerceSync={handleTriggerWooCommerceSync} // Pass sync trigger
                  showToast={showToast}
                  onImportDevices={handleImportDevices}
                  onExportDevices={handleExportDevices}
                />
              )}
            </>
          )
        ) : (
          renderLogin()
        )}
      </main>

      <InfoModal key={infoModalMessage + infoModalType} message={infoModalMessage} onClose={() => setInfoModalMessage('')} type={infoModalType} />
    </div>
  );
}
